-- ===========================================================================
-- 0005_orders.sql — discounts, orders, order items, events, returns
-- Cash only: payment_method is 'cash' (paid at the counter) or
-- 'cash_on_delivery' (collected by the courier).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Discount codes
-- ---------------------------------------------------------------------------
create table if not exists public.discounts (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  description    text,
  type           public.discount_type not null default 'percentage',
  value          numeric(12,2) not null check (value > 0),
  min_subtotal   numeric(12,2) not null default 0 check (min_subtotal >= 0),
  max_discount   numeric(12,2) check (max_discount is null or max_discount > 0),
  applies_to_category_id uuid references public.categories(id) on delete cascade,
  applies_to_product_id  uuid references public.products(id) on delete cascade,
  usage_limit    int check (usage_limit is null or usage_limit > 0),
  used_count     int not null default 0,
  per_customer_limit int check (per_customer_limit is null or per_customer_limit > 0),
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz,
  is_active      boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (type <> 'percentage' or value <= 100)
);

create index if not exists discounts_code_idx on public.discounts(upper(code));

drop trigger if exists discounts_set_updated_at on public.discounts;
create trigger discounts_set_updated_at before update on public.discounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text not null unique,
  channel        public.order_channel not null,
  status         public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'unpaid',
  payment_method public.payment_method not null default 'cash',
  fulfillment    public.fulfillment_type not null default 'in_store',

  customer_id    uuid references public.customers(id) on delete set null,
  location_id    uuid references public.locations(id) on delete set null,
  shift_id       uuid,                       -- FK added in 0006
  cashier_id     uuid references public.profiles(id) on delete set null,

  -- Contact snapshot (online orders from guests have no customer row yet)
  contact_name   text,
  contact_phone  text,
  contact_email  text,
  shipping_address jsonb,

  discount_id    uuid references public.discounts(id) on delete set null,
  discount_code  text,

  subtotal       numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  shipping_total numeric(12,2) not null default 0,
  tax_total      numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,

  -- Cash handling
  amount_tendered numeric(12,2),
  change_given    numeric(12,2),
  amount_paid     numeric(12,2) not null default 0,
  amount_refunded numeric(12,2) not null default 0,

  points_earned   int not null default 0,
  points_redeemed int not null default 0,

  notes          text,
  cancel_reason  text,
  placed_at      timestamptz not null default now(),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_placed_idx    on public.orders(placed_at desc);
create index if not exists orders_status_idx    on public.orders(status);
create index if not exists orders_channel_idx   on public.orders(channel, placed_at desc);
create index if not exists orders_customer_idx  on public.orders(customer_id, placed_at desc);
create index if not exists orders_number_idx    on public.orders(upper(order_number));
create index if not exists orders_phone_idx     on public.orders(contact_phone);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- VT-1001, VT-1002, ...
create or replace function public.next_order_number()
returns text
language sql
volatile
as $$
  select 'VT-' || nextval('public.order_number_seq')::text;
$$;

-- ---------------------------------------------------------------------------
-- Order lines. Product details are snapshotted so history stays truthful even
-- if the product is later renamed, repriced or deleted.
-- ---------------------------------------------------------------------------
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  variant_id    uuid references public.product_variants(id) on delete set null,
  product_id    uuid references public.products(id) on delete set null,

  product_name  text not null,
  variant_label text,                -- "M / Black"
  sku           text,
  size          text,
  color_name    text,
  image_url     text,

  unit_price    numeric(12,2) not null check (unit_price >= 0),
  unit_cost     numeric(12,2) not null default 0,
  quantity      int not null check (quantity > 0),
  discount      numeric(12,2) not null default 0 check (discount >= 0),
  total         numeric(12,2) not null default 0,

  quantity_returned int not null default 0 check (quantity_returned >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists order_items_order_idx   on public.order_items(order_id);
create index if not exists order_items_variant_idx on public.order_items(variant_id);
create index if not exists order_items_product_idx on public.order_items(product_id);

-- loyalty_transactions.order_id FK (table was created in 0004, before orders)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'loyalty_transactions_order_id_fkey') then
    alter table public.loyalty_transactions
      add constraint loyalty_transactions_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Order timeline / audit
-- ---------------------------------------------------------------------------
create table if not exists public.order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  type       text not null,        -- 'created' | 'status_changed' | 'paid' | 'note' | ...
  message    text,
  meta       jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events(order_id, created_at);

-- Log every status / payment change automatically.
create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, type, message, created_by)
    values (new.id, 'created', 'Order ' || new.order_number || ' created', auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_events (order_id, type, message, meta, created_by)
    values (new.id, 'status_changed',
            old.status::text || ' → ' || new.status::text,
            jsonb_build_object('from', old.status, 'to', new.status),
            auth.uid());
  end if;

  if new.payment_status is distinct from old.payment_status then
    insert into public.order_events (order_id, type, message, meta, created_by)
    values (new.id, 'payment_changed',
            old.payment_status::text || ' → ' || new.payment_status::text,
            jsonb_build_object('from', old.payment_status, 'to', new.payment_status),
            auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists orders_log_status on public.orders;
create trigger orders_log_status
  after insert or update on public.orders
  for each row execute function public.log_order_status_change();

-- ---------------------------------------------------------------------------
-- Returns / refunds (cash back out of the drawer)
-- ---------------------------------------------------------------------------
create table if not exists public.returns (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  order_id      uuid not null references public.orders(id) on delete cascade,
  status        public.return_status not null default 'pending',
  reason        text,
  restock       boolean not null default true,
  refund_amount numeric(12,2) not null default 0 check (refund_amount >= 0),
  location_id   uuid references public.locations(id) on delete set null,
  shift_id      uuid,
  processed_by  uuid references public.profiles(id) on delete set null,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.return_items (
  id            uuid primary key default gen_random_uuid(),
  return_id     uuid not null references public.returns(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  variant_id    uuid references public.product_variants(id) on delete set null,
  quantity      int not null check (quantity > 0),
  unit_price    numeric(12,2) not null default 0,
  restock       boolean not null default true
);

create index if not exists returns_order_idx on public.returns(order_id);

drop trigger if exists returns_set_updated_at on public.returns;
create trigger returns_set_updated_at before update on public.returns
  for each row execute function public.set_updated_at();
