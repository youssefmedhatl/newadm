-- ===========================================================================
-- 0003_inventory.sql — stock levels, the movement ledger, transfers,
--                      suppliers and purchase orders
--
-- Design note: `inventory_levels.quantity` is never written directly by the
-- app. Every change is an INSERT into `inventory_movements`, and a trigger
-- applies the delta. That gives a complete, auditable stock history for free.
-- ===========================================================================

create table if not exists public.inventory_levels (
  id             uuid primary key default gen_random_uuid(),
  variant_id     uuid not null references public.product_variants(id) on delete cascade,
  location_id    uuid not null references public.locations(id) on delete cascade,
  quantity       int not null default 0,        -- physically on hand
  reserved       int not null default 0 check (reserved >= 0), -- held by unshipped online orders
  reorder_point  int not null default 3 check (reorder_point >= 0),
  reorder_qty    int not null default 10 check (reorder_qty >= 0),
  updated_at     timestamptz not null default now(),
  unique (variant_id, location_id)
);

create index if not exists inv_levels_variant_idx  on public.inventory_levels(variant_id);
create index if not exists inv_levels_location_idx on public.inventory_levels(location_id);

-- Sellable = on hand minus what's already promised to open online orders.
create or replace function public.available_qty(l public.inventory_levels)
returns int
language sql
stable
as $$
  select greatest(l.quantity - l.reserved, 0);
$$;

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  variant_id     uuid not null references public.product_variants(id) on delete cascade,
  location_id    uuid not null references public.locations(id) on delete cascade,
  delta          int not null check (delta <> 0),   -- +in / -out
  reason         public.movement_reason not null,
  reference_type text,                              -- 'order' | 'return' | 'purchase_order' | 'transfer' | 'stocktake'
  reference_id   uuid,
  unit_cost      numeric(12,2),                     -- for inventory valuation
  note           text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists inv_moves_variant_idx on public.inventory_movements(variant_id, created_at desc);
create index if not exists inv_moves_ref_idx     on public.inventory_movements(reference_type, reference_id);
create index if not exists inv_moves_created_idx on public.inventory_movements(created_at desc);

-- Apply every movement to the running total.
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.inventory_levels (variant_id, location_id, quantity)
  values (new.variant_id, new.location_id, new.delta)
  on conflict (variant_id, location_id)
  do update set
    quantity   = public.inventory_levels.quantity + excluded.quantity,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists inventory_movement_applied on public.inventory_movements;
create trigger inventory_movement_applied
  after insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

-- Convenience wrapper used by the admin UI's "adjust stock" action.
create or replace function public.adjust_stock(
  p_variant_id  uuid,
  p_location_id uuid,
  p_delta       int,
  p_reason      public.movement_reason default 'adjustment',
  p_note        text default null
)
returns public.inventory_levels
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.inventory_levels;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to adjust stock';
  end if;

  if p_delta = 0 then
    raise exception 'Adjustment must be non-zero';
  end if;

  insert into public.inventory_movements
    (variant_id, location_id, delta, reason, note, created_by)
  values
    (p_variant_id, p_location_id, p_delta, p_reason, p_note, auth.uid());

  select * into result
  from public.inventory_levels
  where variant_id = p_variant_id and location_id = p_location_id;

  return result;
end;
$$;

-- Set stock to an absolute number (stocktake / counting screen).
create or replace function public.set_stock(
  p_variant_id  uuid,
  p_location_id uuid,
  p_counted     int,
  p_note        text default null
)
returns public.inventory_levels
language plpgsql
security definer
set search_path = public
as $$
declare
  current_qty int;
  diff        int;
  result      public.inventory_levels;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to adjust stock';
  end if;

  if p_counted < 0 then
    raise exception 'Counted quantity cannot be negative';
  end if;

  select coalesce(quantity, 0) into current_qty
  from public.inventory_levels
  where variant_id = p_variant_id and location_id = p_location_id;

  current_qty := coalesce(current_qty, 0);
  diff := p_counted - current_qty;

  if diff <> 0 then
    insert into public.inventory_movements
      (variant_id, location_id, delta, reason, note, created_by)
    values
      (p_variant_id, p_location_id, diff, 'stocktake',
       coalesce(p_note, 'Stocktake: counted ' || p_counted), auth.uid());
  else
    -- No movement needed, but make sure a level row exists.
    insert into public.inventory_levels (variant_id, location_id, quantity)
    values (p_variant_id, p_location_id, p_counted)
    on conflict (variant_id, location_id) do nothing;
  end if;

  select * into result
  from public.inventory_levels
  where variant_id = p_variant_id and location_id = p_location_id;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suppliers & purchase orders
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text,
  phone        text,
  email        text,
  address      text,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

create table if not exists public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  supplier_id   uuid references public.suppliers(id) on delete set null,
  location_id   uuid not null references public.locations(id) on delete restrict,
  status        public.po_status not null default 'draft',
  expected_at   date,
  received_at   timestamptz,
  subtotal      numeric(12,2) not null default 0,
  shipping_cost numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  variant_id        uuid not null references public.product_variants(id) on delete restrict,
  quantity_ordered  int not null check (quantity_ordered > 0),
  quantity_received int not null default 0 check (quantity_received >= 0),
  unit_cost         numeric(12,2) not null default 0 check (unit_cost >= 0),
  created_at        timestamptz not null default now()
);

create index if not exists po_items_po_idx on public.purchase_order_items(purchase_order_id);

drop trigger if exists po_set_updated_at on public.purchase_orders;
create trigger po_set_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();

-- Receive some/all of a purchase order — writes movements and updates status.
create or replace function public.receive_purchase_order(
  p_po_id uuid,
  p_lines jsonb   -- [{ "item_id": uuid, "quantity": int }]
)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  po        public.purchase_orders;
  line      jsonb;
  item      public.purchase_order_items;
  qty       int;
  remaining int;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to receive stock';
  end if;

  select * into po from public.purchase_orders where id = p_po_id for update;
  if po is null then
    raise exception 'Purchase order not found';
  end if;
  if po.status in ('received','cancelled') then
    raise exception 'Purchase order is already %', po.status;
  end if;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    qty := (line->>'quantity')::int;
    continue when qty is null or qty <= 0;

    select * into item
    from public.purchase_order_items
    where id = (line->>'item_id')::uuid and purchase_order_id = p_po_id
    for update;

    if item is null then
      raise exception 'Line item % does not belong to this purchase order', line->>'item_id';
    end if;

    remaining := item.quantity_ordered - item.quantity_received;
    if qty > remaining then
      qty := remaining;    -- never receive more than was ordered
    end if;
    continue when qty <= 0;

    insert into public.inventory_movements
      (variant_id, location_id, delta, reason, reference_type, reference_id, unit_cost, created_by)
    values
      (item.variant_id, po.location_id, qty, 'purchase', 'purchase_order', po.id, item.unit_cost, auth.uid());

    update public.purchase_order_items
      set quantity_received = quantity_received + qty
      where id = item.id;
  end loop;

  -- Recompute the header status from the lines.
  update public.purchase_orders
    set status = case
          when not exists (
            select 1 from public.purchase_order_items
            where purchase_order_id = p_po_id and quantity_received < quantity_ordered
          ) then 'received'::public.po_status
          when exists (
            select 1 from public.purchase_order_items
            where purchase_order_id = p_po_id and quantity_received > 0
          ) then 'partially_received'::public.po_status
          else status
        end,
        received_at = case
          when not exists (
            select 1 from public.purchase_order_items
            where purchase_order_id = p_po_id and quantity_received < quantity_ordered
          ) then now() else received_at
        end
    where id = p_po_id
    returning * into po;

  return po;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock transfers between branches
-- ---------------------------------------------------------------------------
create table if not exists public.stock_transfers (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  from_location_id uuid not null references public.locations(id) on delete restrict,
  to_location_id   uuid not null references public.locations(id) on delete restrict,
  status          public.transfer_status not null default 'draft',
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  sent_at         timestamptz,
  received_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create table if not exists public.stock_transfer_items (
  id          uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  variant_id  uuid not null references public.product_variants(id) on delete restrict,
  quantity    int not null check (quantity > 0)
);

drop trigger if exists transfers_set_updated_at on public.stock_transfers;
create trigger transfers_set_updated_at before update on public.stock_transfers
  for each row execute function public.set_updated_at();

-- Move the goods: one negative movement at source, one positive at destination.
create or replace function public.complete_stock_transfer(p_transfer_id uuid)
returns public.stock_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  t    public.stock_transfers;
  item record;
begin
  if not public.is_staff() then
    raise exception 'Not authorised';
  end if;

  select * into t from public.stock_transfers where id = p_transfer_id for update;
  if t is null then
    raise exception 'Transfer not found';
  end if;
  if t.status = 'received' then
    raise exception 'Transfer already received';
  end if;
  if t.status = 'cancelled' then
    raise exception 'Transfer was cancelled';
  end if;

  for item in select * from public.stock_transfer_items where transfer_id = p_transfer_id
  loop
    insert into public.inventory_movements
      (variant_id, location_id, delta, reason, reference_type, reference_id, created_by)
    values
      (item.variant_id, t.from_location_id, -item.quantity, 'transfer_out', 'transfer', t.id, auth.uid()),
      (item.variant_id, t.to_location_id,    item.quantity, 'transfer_in',  'transfer', t.id, auth.uid());
  end loop;

  update public.stock_transfers
    set status = 'received', received_at = now(), sent_at = coalesce(sent_at, now())
    where id = p_transfer_id
    returning * into t;

  return t;
end;
$$;
