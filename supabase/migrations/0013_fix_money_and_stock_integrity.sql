-- ===========================================================================
-- 0013_fix_money_and_stock_integrity.sql
--
-- Fixes found in the 2026-07-29 audit (docs/BUG_REPORT.md). Everything here is
-- about money leaving the drawer, stock counts drifting, or one customer
-- reaching another customer's data.
--
-- S1-01  process_return refunded the pre-discount price (over-refund)
-- S1-02  cancel_order double-restocked and double-refunded returned units
-- S1-03  checkout let a signed-in user claim an unlinked customer by phone
-- S1-04  process_return would refund an order that was never paid
-- S1-05  customers could edit their own loyalty_points / total_spent
-- S2-02  cashiers could apply an unbounded manual discount
-- S2-03  shift_id was trusted without checking it is open / same branch
-- S2-04  amount_tendered was never validated server-side
-- S2-05  p_location_id on online orders was unvalidated
-- S2-06  order lines stored English product names only
--
-- Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- S2-06 — keep the Arabic product name on the order line as well.
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists product_name_ar text;

update public.order_items oi
   set product_name_ar = p.name_ar
  from public.products p
 where p.id = oi.product_id
   and oi.product_name_ar is null;

-- ---------------------------------------------------------------------------
-- S1-05 — a customer may edit their contact details, nothing else.
-- RLS cannot restrict columns, so the guard lives in a trigger.
-- ---------------------------------------------------------------------------
create or replace function public.protect_customer_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only guard updates arriving straight from the API as anon/authenticated.
  -- Internal rollups (refresh_customer_totals, loyalty triggers) run inside
  -- SECURITY DEFINER functions as the function owner and must pass through,
  -- otherwise orders_count / total_spent / loyalty_points could never change.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.is_staff() then
    return new;
  end if;

  new.loyalty_points := old.loyalty_points;
  new.total_spent    := old.total_spent;
  new.orders_count   := old.orders_count;
  new.last_order_at  := old.last_order_at;
  new.is_blocked     := old.is_blocked;
  new.user_id        := old.user_id;
  new.tags           := old.tags;
  new.notes          := old.notes;

  return new;
end;
$$;

drop trigger if exists customers_protect_columns on public.customers;
create trigger customers_protect_columns
  before update on public.customers
  for each row execute function public.protect_customer_columns();

-- ---------------------------------------------------------------------------
-- S2-03 — one place that decides whether a shift may receive money.
-- ---------------------------------------------------------------------------
create or replace function public.assert_shift_usable(
  p_shift_id    uuid,
  p_location_id uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.shifts;
begin
  if p_shift_id is null then
    return;
  end if;

  select * into s from public.shifts where id = p_shift_id;

  if s is null then
    raise exception 'That till session no longer exists';
  end if;
  if s.status <> 'open' then
    raise exception 'That till session is already closed';
  end if;
  if p_location_id is not null and s.location_id <> p_location_id then
    raise exception 'That till session belongs to a different branch';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- How much of an order line did the customer actually pay?
-- order_items.total is the line before any order-level discount. The order
-- level discount is shared across lines in proportion to their totals.
-- ---------------------------------------------------------------------------
create or replace function public.order_line_paid_per_unit(p_order_item_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  oi          public.order_items;
  o           public.orders;
  lines_total numeric(12,2);
  share       numeric;
  net_line    numeric(12,2);
begin
  select * into oi from public.order_items where id = p_order_item_id;
  if oi is null or oi.quantity = 0 then
    return 0;
  end if;

  select * into o from public.orders where id = oi.order_id;

  select coalesce(sum(total), 0) into lines_total
    from public.order_items where order_id = oi.order_id;

  if lines_total <= 0 then
    return 0;
  end if;

  share    := oi.total / lines_total;
  net_line := oi.total - round(coalesce(o.discount_total, 0) * share, 2);

  return greatest(net_line, 0) / oi.quantity;
end;
$$;

-- ===========================================================================
-- create_pos_sale — S2-02 manual discount cap, S2-03 shift, S2-04 tendered,
-- S2-06 Arabic name, S3-02 consistent subtotal.
-- ===========================================================================
create or replace function public.create_pos_sale(
  p_location_id     uuid,
  p_items           jsonb,
  p_shift_id        uuid    default null,
  p_customer_id     uuid    default null,
  p_discount_code   text    default null,
  p_manual_discount numeric default 0,
  p_amount_tendered numeric default null,
  p_notes           text    default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o             public.orders;
  line          jsonb;
  v             public.product_variants;
  prod          public.products;
  qty           int;
  price         numeric(12,2);
  cost          numeric(12,2);
  line_discount numeric(12,2);
  line_total    numeric(12,2);
  v_subtotal    numeric(12,2) := 0;
  v_linedisc    numeric(12,2) := 0;
  v_discount    numeric(12,2) := 0;
  v_manual      numeric(12,2);
  v_total       numeric(12,2);
  disc          jsonb;
  disc_id       uuid;
  avail         int;
  img           text;
  cap_pct       numeric;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to take a sale';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot create an empty sale';
  end if;

  if not exists (select 1 from public.locations
                  where id = p_location_id and is_active) then
    raise exception 'That branch is not available';
  end if;

  perform public.assert_shift_usable(p_shift_id, p_location_id);

  insert into public.orders (
    order_number, channel, status, payment_status, payment_method, fulfillment,
    customer_id, location_id, shift_id, cashier_id, notes
  ) values (
    public.next_order_number(), 'pos', 'completed', 'paid', 'cash', 'in_store',
    p_customer_id, p_location_id, p_shift_id, auth.uid(), p_notes
  ) returning * into o;

  for line in select * from jsonb_array_elements(p_items)
  loop
    qty := coalesce((line->>'quantity')::int, 0);
    if qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    select * into v from public.product_variants where id = (line->>'variant_id')::uuid;
    if v is null then
      raise exception 'Product variant % not found', line->>'variant_id';
    end if;

    select * into prod from public.products where id = v.product_id;

    select public.available_qty(l) into avail
    from public.inventory_levels l
    where l.variant_id = v.id and l.location_id = p_location_id
    for update;

    if coalesce(avail, 0) < qty then
      raise exception 'Not enough stock for % (%): % available, % requested',
        prod.name_en, v.sku, coalesce(avail, 0), qty;
    end if;

    price         := coalesce((line->>'unit_price')::numeric, v.price, prod.price);
    cost          := coalesce(v.cost_price, prod.cost_price, 0);
    line_discount := greatest(coalesce((line->>'discount')::numeric, 0), 0);
    -- S3-02: the line total is now GROSS, matching create_online_order.
    -- Per-line discounts accumulate into discount_total instead of being
    -- silently folded into subtotal.
    line_total    := round(price * qty, 2);
    line_discount := least(line_discount, line_total);

    select url into img from public.product_images
      where product_id = prod.id order by position limit 1;

    insert into public.order_items (
      order_id, variant_id, product_id, product_name, product_name_ar,
      variant_label, sku, size, color_name, image_url,
      unit_price, unit_cost, quantity, discount, total
    ) values (
      o.id, v.id, prod.id, prod.name_en, prod.name_ar,
      nullif(concat_ws(' / ', v.size, v.color_name), ''), v.sku,
      v.size, v.color_name, img, price, cost, qty, line_discount, line_total
    );

    insert into public.inventory_movements
      (variant_id, location_id, delta, reason, reference_type, reference_id, unit_cost, created_by)
    values
      (v.id, p_location_id, -qty, 'sale', 'order', o.id, cost, auth.uid());

    v_subtotal := v_subtotal + line_total;
    v_linedisc := v_linedisc + line_discount;
  end loop;

  if p_discount_code is not null and btrim(p_discount_code) <> '' then
    disc := public.validate_discount(p_discount_code, v_subtotal - v_linedisc, p_customer_id);
    if (disc->>'valid')::boolean then
      v_discount := (disc->>'amount')::numeric;
      disc_id    := (disc->>'discount_id')::uuid;
      update public.discounts set used_count = used_count + 1 where id = disc_id;
    else
      raise exception 'Discount code rejected: %', disc->>'reason';
    end if;
  end if;

  -- S2-02 — a cashier may only discount up to a configured share of the sale.
  v_manual := greatest(coalesce(p_manual_discount, 0), 0);
  if v_manual > 0 and not public.is_manager() then
    cap_pct := coalesce(
      (public.get_setting('pos', '{"max_cashier_discount_pct": 10}'::jsonb)
        ->>'max_cashier_discount_pct')::numeric, 10);
    if v_manual > round(v_subtotal * cap_pct / 100.0, 2) then
      raise exception
        'A manual discount above % percent of the sale needs a manager', cap_pct;
    end if;
  end if;

  v_discount := least(v_subtotal, v_discount + v_linedisc + v_manual);
  v_total    := round(v_subtotal - v_discount, 2);

  -- S2-04 — never book an underpaid sale as fully paid.
  if p_amount_tendered is not null and p_amount_tendered < v_total then
    raise exception 'Amount tendered (%) is less than the total (%)',
      p_amount_tendered, v_total;
  end if;

  update public.orders set
    subtotal        = v_subtotal,
    discount_total  = v_discount,
    discount_id     = disc_id,
    discount_code   = case when disc_id is not null then p_discount_code else null end,
    total           = v_total,
    amount_paid     = v_total,
    amount_tendered = p_amount_tendered,
    change_given    = case
                        when p_amount_tendered is null then null
                        else round(p_amount_tendered - v_total, 2)
                      end,
    completed_at    = now()
  where id = o.id
  returning * into o;

  if p_shift_id is not null and o.total > 0 then
    insert into public.cash_movements (shift_id, type, amount, reason, order_id, created_by)
    values (p_shift_id, 'sale', o.total, 'Sale ' || o.order_number, o.id, auth.uid());
  end if;

  perform public.award_loyalty_points(o.id);

  select * into o from public.orders where id = o.id;
  return o;
end;
$$;

-- ===========================================================================
-- create_online_order — S1-03 account claiming, S2-05 branch validation,
-- S2-06 Arabic name.
-- ===========================================================================
create or replace function public.create_online_order(
  p_items         jsonb,
  p_contact_name  text,
  p_contact_phone text,
  p_fulfillment   public.fulfillment_type default 'delivery',
  p_contact_email text default null,
  p_address       jsonb default null,
  p_discount_code text default null,
  p_notes         text default null,
  p_location_id   uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o           public.orders;
  line        jsonb;
  v           public.product_variants;
  prod        public.products;
  qty         int;
  price       numeric(12,2);
  cost        numeric(12,2);
  v_subtotal  numeric(12,2) := 0;
  v_discount  numeric(12,2) := 0;
  v_shipping  numeric(12,2) := 0;
  disc        jsonb;
  disc_id     uuid;
  avail       int;
  loc         uuid;
  cust        uuid;
  img         text;
  ship_cfg    jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Your bag is empty';
  end if;
  if p_contact_name is null or btrim(p_contact_name) = '' then
    raise exception 'A name is required';
  end if;
  if p_contact_phone is null or btrim(p_contact_phone) = '' then
    raise exception 'A phone number is required';
  end if;
  if p_fulfillment = 'delivery' and p_address is null then
    raise exception 'A delivery address is required';
  end if;

  -- S2-05 — an explicitly supplied branch must also be one that serves online.
  if p_location_id is not null then
    if not exists (select 1 from public.locations
                    where id = p_location_id and is_active and sells_online) then
      raise exception 'That branch cannot fulfil online orders';
    end if;
    loc := p_location_id;
  else
    select id into loc from public.locations
      where is_active and sells_online
      order by position, created_at limit 1;
  end if;

  if loc is null then
    raise exception 'No branch is available to fulfil online orders';
  end if;

  -- S1-03 — a signed-in shopper is matched by their own account first. A
  -- customer row found only by phone is reused for history, but its user_id
  -- is NEVER reassigned, so ordering with someone else's phone number cannot
  -- attach your login to their record.
  cust := null;

  if auth.uid() is not null then
    select id into cust from public.customers where user_id = auth.uid() limit 1;
  end if;

  if cust is null then
    select id into cust from public.customers
      where phone = btrim(p_contact_phone) limit 1;
  end if;

  if cust is null then
    insert into public.customers (full_name, phone, email, user_id)
    values (btrim(p_contact_name), btrim(p_contact_phone),
            nullif(btrim(coalesce(p_contact_email,'')), ''), auth.uid())
    returning id into cust;
  end if;

  if exists (select 1 from public.customers where id = cust and is_blocked) then
    raise exception 'This account cannot place orders. Please contact the store.';
  end if;

  insert into public.orders (
    order_number, channel, status, payment_status, payment_method, fulfillment,
    customer_id, location_id, contact_name, contact_phone, contact_email,
    shipping_address, notes
  ) values (
    public.next_order_number(), 'online', 'pending', 'unpaid',
    case when p_fulfillment = 'pickup' then 'cash' else 'cash_on_delivery' end,
    p_fulfillment,
    cust, loc, btrim(p_contact_name), btrim(p_contact_phone),
    nullif(btrim(coalesce(p_contact_email,'')), ''), p_address, p_notes
  ) returning * into o;

  for line in select * from jsonb_array_elements(p_items)
  loop
    qty := coalesce((line->>'quantity')::int, 0);
    if qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    select * into v from public.product_variants where id = (line->>'variant_id')::uuid and is_active;
    if v is null then
      raise exception 'That item is no longer available';
    end if;

    select * into prod from public.products where id = v.product_id and status = 'active';
    if prod is null then
      raise exception 'That item is no longer available';
    end if;

    select public.available_qty(l) into avail
    from public.inventory_levels l
    where l.variant_id = v.id and l.location_id = loc
    for update;

    if coalesce(avail, 0) < qty then
      raise exception 'Only % left of % (%)', coalesce(avail, 0), prod.name_en,
        coalesce(nullif(concat_ws(' / ', v.size, v.color_name), ''), v.sku);
    end if;

    price := coalesce(v.price, prod.price);
    cost  := coalesce(v.cost_price, prod.cost_price, 0);

    select url into img from public.product_images
      where product_id = prod.id order by position limit 1;

    insert into public.order_items (
      order_id, variant_id, product_id, product_name, product_name_ar,
      variant_label, sku, size, color_name, image_url,
      unit_price, unit_cost, quantity, total
    ) values (
      o.id, v.id, prod.id, prod.name_en, prod.name_ar,
      nullif(concat_ws(' / ', v.size, v.color_name), ''), v.sku,
      v.size, v.color_name, img, price, cost, qty, round(price * qty, 2)
    );

    update public.inventory_levels
      set reserved = reserved + qty, updated_at = now()
      where variant_id = v.id and location_id = loc;

    v_subtotal := v_subtotal + round(price * qty, 2);
  end loop;

  if p_discount_code is not null and btrim(p_discount_code) <> '' then
    disc := public.validate_discount(p_discount_code, v_subtotal, cust);
    if (disc->>'valid')::boolean then
      v_discount := (disc->>'amount')::numeric;
      disc_id    := (disc->>'discount_id')::uuid;
      update public.discounts set used_count = used_count + 1 where id = disc_id;
    else
      raise exception 'Discount code rejected: %', disc->>'reason';
    end if;
  end if;

  if p_fulfillment = 'delivery' then
    ship_cfg := public.get_setting('shipping', '{"flat_fee": 50, "free_over": 1500}'::jsonb);
    v_shipping := coalesce((ship_cfg->>'flat_fee')::numeric, 0);
    if (ship_cfg->>'free_over') is not null
       and v_subtotal - v_discount >= (ship_cfg->>'free_over')::numeric then
      v_shipping := 0;
    end if;
  end if;

  update public.orders set
    subtotal       = v_subtotal,
    discount_total = v_discount,
    discount_id    = disc_id,
    discount_code  = case when disc_id is not null then p_discount_code else null end,
    shipping_total = v_shipping,
    total          = round(v_subtotal - v_discount + v_shipping, 2)
  where id = o.id
  returning * into o;

  insert into public.notifications (type, severity, title, body, entity_type, entity_id, link)
  values ('new_order', 'info', 'طلب أونلاين جديد · New online order',
          o.order_number || ' — ' || o.total::text,
          'order', o.id, '/admin/orders/' || o.id);

  return o;
end;
$$;

-- ===========================================================================
-- complete_order — S2-03 shift validation.
-- ===========================================================================
create or replace function public.complete_order(
  p_order_id uuid,
  p_shift_id uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
begin
  if not public.is_staff() then
    raise exception 'Not authorised';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o is null then raise exception 'Order not found'; end if;
  if o.status = 'completed' then return o; end if;
  if o.status = 'cancelled' then raise exception 'Cancelled orders cannot be completed'; end if;

  perform public.assert_shift_usable(p_shift_id, o.location_id);

  if o.channel = 'online' then
    perform public.consume_reservation(p_order_id);
  end if;

  update public.orders set
    status         = 'completed',
    payment_status = 'paid',
    amount_paid    = total,
    completed_at   = now(),
    shift_id       = coalesce(p_shift_id, shift_id)
  where id = p_order_id
  returning * into o;

  if coalesce(p_shift_id, o.shift_id) is not null and o.total > 0 and o.channel = 'online' then
    insert into public.cash_movements (shift_id, type, amount, reason, order_id, created_by)
    values (coalesce(p_shift_id, o.shift_id), 'sale', o.total,
            'Collected ' || o.order_number, o.id, auth.uid());
  end if;

  perform public.award_loyalty_points(p_order_id);

  select * into o from public.orders where id = p_order_id;
  return o;
end;
$$;

-- ===========================================================================
-- cancel_order — S1-02. Restock only what is still with the customer, and
-- refund only what has not already been refunded by a return.
-- ===========================================================================
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason   text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o          public.orders;
  item       record;
  outstanding numeric(12,2);
  still_out  int;
begin
  if not public.is_staff() then
    raise exception 'Not authorised';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o is null then raise exception 'Order not found'; end if;
  if o.status = 'cancelled' then return o; end if;

  if o.channel = 'online' and o.status <> 'completed' then
    perform public.release_reservation(p_order_id);
  else
    for item in
      select variant_id, quantity, quantity_returned, unit_cost
      from public.order_items
      where order_id = p_order_id and variant_id is not null
    loop
      -- Units already returned were restocked by process_return.
      still_out := item.quantity - coalesce(item.quantity_returned, 0);
      if still_out > 0 then
        insert into public.inventory_movements
          (variant_id, location_id, delta, reason, reference_type, reference_id, unit_cost, created_by)
        values
          (item.variant_id, o.location_id, still_out, 'cancellation', 'order', o.id,
           item.unit_cost, auth.uid());
      end if;
    end loop;

    -- Only the part of the money still held by the shop goes back out.
    outstanding := round(coalesce(o.amount_paid, 0) - coalesce(o.amount_refunded, 0), 2);
    if o.shift_id is not null and outstanding > 0 then
      insert into public.cash_movements (shift_id, type, amount, reason, order_id, created_by)
      values (o.shift_id, 'refund', -outstanding,
              'Cancelled ' || o.order_number, o.id, auth.uid());
    end if;
  end if;

  if o.points_earned > 0 and o.customer_id is not null then
    insert into public.loyalty_transactions (customer_id, points, reason, order_id, note)
    values (o.customer_id, -o.points_earned, 'order_cancelled', o.id, 'Order cancelled');
  end if;

  if o.discount_id is not null then
    update public.discounts set used_count = greatest(used_count - 1, 0) where id = o.discount_id;
  end if;

  update public.orders set
    status          = 'cancelled',
    cancel_reason   = p_reason,
    payment_status  = case when amount_paid > 0 then 'refunded' else payment_status end,
    amount_refunded = greatest(coalesce(amount_refunded, 0), coalesce(amount_paid, 0)),
    points_earned   = 0
  where id = p_order_id
  returning * into o;

  return o;
end;
$$;

-- ---------------------------------------------------------------------------
-- S3-05 — returns get their own counter so order numbers stop skipping.
-- Starts above the current order sequence so existing references stay unique.
-- Created before process_return, which draws from it.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_class where relname = 'return_reference_seq') then
    execute 'create sequence public.return_reference_seq start with '
            || greatest((select last_value from public.order_number_seq) + 1000, 1000)::text;
  end if;
end $$;

grant usage on sequence public.return_reference_seq to authenticated;

-- ===========================================================================
-- process_return — S1-01 refund what was paid, S1-04 refuse unpaid orders,
-- S2-03 shift validation.
-- ===========================================================================
create or replace function public.process_return(
  p_order_id uuid,
  p_lines    jsonb,
  p_reason   text default null,
  p_shift_id uuid default null
)
returns public.returns
language plpgsql
security definer
set search_path = public
as $$
declare
  o          public.orders;
  r          public.returns;
  line       jsonb;
  oi         public.order_items;
  qty        int;
  restock    boolean;
  per_unit   numeric(12,2);
  refund     numeric(12,2) := 0;
  refundable numeric(12,2);
  ref        text;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to process returns';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o is null then raise exception 'Order not found'; end if;
  if o.status = 'cancelled' then raise exception 'Order was cancelled'; end if;

  -- S1-04 — nothing was collected, so nothing can go back out.
  if coalesce(o.amount_paid, 0) <= 0 then
    raise exception 'This order has not been paid yet, so it cannot be refunded';
  end if;

  perform public.assert_shift_usable(p_shift_id, o.location_id);

  ref := 'RT-' || nextval('public.return_reference_seq')::text;

  insert into public.returns (reference, order_id, status, reason, location_id, shift_id, processed_by, processed_at)
  values (ref, p_order_id, 'completed', p_reason, o.location_id,
          coalesce(p_shift_id, o.shift_id), auth.uid(), now())
  returning * into r;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    qty     := coalesce((line->>'quantity')::int, 0);
    restock := coalesce((line->>'restock')::boolean, true);
    continue when qty <= 0;

    select * into oi from public.order_items
      where id = (line->>'order_item_id')::uuid and order_id = p_order_id
      for update;

    if oi is null then
      raise exception 'Line item does not belong to this order';
    end if;

    if qty > oi.quantity - oi.quantity_returned then
      raise exception 'Cannot return % of % — only % remain',
        qty, oi.product_name, oi.quantity - oi.quantity_returned;
    end if;

    -- S1-01 — refund what this unit actually cost the customer, after both
    -- the line discount and its share of the order-level discount.
    per_unit := public.order_line_paid_per_unit(oi.id);

    insert into public.return_items (return_id, order_item_id, variant_id, quantity, unit_price, restock)
    values (r.id, oi.id, oi.variant_id, qty, per_unit, restock);

    update public.order_items
      set quantity_returned = quantity_returned + qty
      where id = oi.id;

    if restock and oi.variant_id is not null and o.location_id is not null then
      insert into public.inventory_movements
        (variant_id, location_id, delta, reason, reference_type, reference_id, unit_cost, created_by)
      values
        (oi.variant_id, o.location_id, qty, 'return', 'return', r.id, oi.unit_cost, auth.uid());
    end if;

    refund := refund + round(per_unit * qty, 2);
  end loop;

  if refund <= 0 then
    raise exception 'Nothing was returned';
  end if;

  -- Never hand back more than is still held for this order.
  refundable := round(coalesce(o.amount_paid, 0) - coalesce(o.amount_refunded, 0), 2);
  refund     := least(refund, greatest(refundable, 0));

  if refund <= 0 then
    raise exception 'This order has already been fully refunded';
  end if;

  update public.returns set refund_amount = refund where id = r.id returning * into r;

  update public.orders set
    amount_refunded = coalesce(amount_refunded, 0) + refund,
    payment_status  = case
      when coalesce(amount_refunded, 0) + refund >= total then 'refunded'::public.payment_status
      else 'partially_refunded'::public.payment_status
    end
  where id = p_order_id;

  if coalesce(p_shift_id, o.shift_id) is not null then
    insert into public.cash_movements (shift_id, type, amount, reason, order_id, created_by)
    values (coalesce(p_shift_id, o.shift_id), 'refund', -refund,
            'Refund ' || r.reference, o.id, auth.uid());
  end if;

  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants are unchanged in shape; re-stated because the signatures were
-- replaced above.
-- ---------------------------------------------------------------------------
grant execute on function public.create_online_order(jsonb, text, text, public.fulfillment_type, text, jsonb, text, text, uuid) to anon, authenticated;
grant execute on function public.create_pos_sale(uuid, jsonb, uuid, uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.complete_order(uuid, uuid) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.process_return(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.assert_shift_usable(uuid, uuid) to authenticated;
grant execute on function public.order_line_paid_per_unit(uuid) to authenticated;

revoke execute on function public.protect_customer_columns() from anon, authenticated;
