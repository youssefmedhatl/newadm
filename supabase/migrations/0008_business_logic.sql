-- ===========================================================================
-- 0008_business_logic.sql — the transactional core
--
-- Everything that touches money or stock goes through one of these functions
-- so the rules live in the database, not in the browser. They are
-- SECURITY DEFINER, which means they bypass RLS — so each one re-checks
-- permissions itself and NEVER trusts a client-supplied price for an online
-- order.
-- ===========================================================================
--
-- NOTE: this file is a consolidation of what the live project has applied as
-- 0008a_helpers_and_rollups, 0008b_create_pos_sale, 0008c_create_online_order
-- and 0008d_lifecycle_returns_grants. Several functions defined here were later
-- replaced by 0013 and 0015 — those are authoritative. Do not assume this file
-- reflects the current database.

-- ---------------------------------------------------------------------------
-- Settings helper
-- ---------------------------------------------------------------------------
create or replace function public.get_setting(p_key text, p_default jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Discount validation. Returns { valid, discount_id, amount, reason }.
-- ---------------------------------------------------------------------------
create or replace function public.validate_discount(
  p_code     text,
  p_subtotal numeric,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d      public.discounts;
  amount numeric(12,2);
  used_by_customer int;
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('valid', false, 'amount', 0, 'reason', 'no_code');
  end if;

  select * into d from public.discounts
  where upper(code) = upper(btrim(p_code));

  if d is null then
    return jsonb_build_object('valid', false, 'amount', 0, 'reason', 'not_found');
  end if;
  if not d.is_active then
    return jsonb_build_object('valid', false, 'amount', 0, 'reason', 'inactive');
  end if;
  if d.starts_at > now() then
    return jsonb_build_object('valid', false, 'amount', 0, 'reason', 'not_started');
  end if;
  if d.ends_at is not null and d.ends_at < now() then
    return jsonb_build_object('valid', false, 'amount', 0, 'reason', 'expired');
  end if;
  if d.usage_limit is not null and d.used_count >= d.usage_limit then
    return jsonb_build_object('valid', false, 'amount', 0, 'reason', 'usage_limit_reached');
  end if;
  if p_subtotal < d.min_subtotal then
    return jsonb_build_object(
      'valid', false, 'amount', 0,
      'reason', 'min_subtotal', 'min_subtotal', d.min_subtotal
    );
  end if;

  if d.per_customer_limit is not null and p_customer_id is not null then
    select count(*) into used_by_customer
    from public.orders
    where customer_id = p_customer_id
      and discount_id = d.id
      and status <> 'cancelled';

    if used_by_customer >= d.per_customer_limit then
      return jsonb_build_object('valid', false, 'amount', 0, 'reason', 'customer_limit_reached');
    end if;
  end if;

  if d.type = 'percentage' then
    amount := round(p_subtotal * d.value / 100.0, 2);
  else
    amount := d.value;
  end if;

  if d.max_discount is not null then
    amount := least(amount, d.max_discount);
  end if;
  amount := least(amount, p_subtotal);   -- never discount below zero

  return jsonb_build_object(
    'valid', true,
    'discount_id', d.id,
    'code', d.code,
    'type', d.type,
    'value', d.value,
    'amount', amount
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Reservation helpers (online orders hold stock without removing it)
-- ---------------------------------------------------------------------------
create or replace function public.release_reservation(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o    public.orders;
  item record;
begin
  select * into o from public.orders where id = p_order_id;
  if o is null or o.location_id is null then return; end if;

  for item in
    select variant_id, quantity from public.order_items
    where order_id = p_order_id and variant_id is not null
  loop
    update public.inventory_levels
      set reserved = greatest(reserved - item.quantity, 0), updated_at = now()
      where variant_id = item.variant_id and location_id = o.location_id;
  end loop;
end;
$$;

-- Turn a reservation into a real stock deduction.
create or replace function public.consume_reservation(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o    public.orders;
  item record;
begin
  select * into o from public.orders where id = p_order_id;
  if o is null or o.location_id is null then return; end if;

  for item in
    select variant_id, quantity, unit_cost from public.order_items
    where order_id = p_order_id and variant_id is not null
  loop
    update public.inventory_levels
      set reserved = greatest(reserved - item.quantity, 0), updated_at = now()
      where variant_id = item.variant_id and location_id = o.location_id;

    insert into public.inventory_movements
      (variant_id, location_id, delta, reason, reference_type, reference_id, unit_cost, created_by)
    values
      (item.variant_id, o.location_id, -item.quantity, 'sale', 'order', o.id, item.unit_cost, auth.uid());
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Loyalty
-- ---------------------------------------------------------------------------
create or replace function public.award_loyalty_points(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  o        public.orders;
  cfg      jsonb;
  rate     numeric;
  pts      int;
begin
  select * into o from public.orders where id = p_order_id;
  if o is null or o.customer_id is null or o.points_earned > 0 then
    return 0;
  end if;

  cfg  := public.get_setting('loyalty', '{"points_per_currency": 1, "enabled": true}'::jsonb);
  if coalesce((cfg->>'enabled')::boolean, true) is not true then
    return 0;
  end if;

  rate := coalesce((cfg->>'points_per_currency')::numeric, 1);
  pts  := floor(o.total * rate)::int;

  if pts <= 0 then return 0; end if;

  insert into public.loyalty_transactions (customer_id, points, reason, order_id)
  values (o.customer_id, pts, 'order', o.id);

  update public.orders set points_earned = pts where id = o.id;
  return pts;
end;
$$;

-- Keep customers.orders_count / total_spent / last_order_at accurate.
create or replace function public.refresh_customer_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := coalesce(new.customer_id, old.customer_id);
begin
  if cid is null then return null; end if;

  update public.customers c
    set orders_count = (
          select count(*) from public.orders o
          where o.customer_id = cid and o.status <> 'cancelled'
        ),
        total_spent = (
          select coalesce(sum(o.total - o.amount_refunded), 0) from public.orders o
          where o.customer_id = cid and o.status <> 'cancelled'
        ),
        last_order_at = (
          select max(o.placed_at) from public.orders o
          where o.customer_id = cid and o.status <> 'cancelled'
        )
    where c.id = cid;

  return null;
end;
$$;

drop trigger if exists orders_refresh_customer on public.orders;
create trigger orders_refresh_customer
  after insert or update or delete on public.orders
  for each row execute function public.refresh_customer_totals();

-- Keep products.total_sold accurate.
create or replace function public.refresh_product_sold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid := coalesce(new.product_id, old.product_id);
begin
  if pid is null then return null; end if;

  update public.products p
    set total_sold = (
      select coalesce(sum(oi.quantity - oi.quantity_returned), 0)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = pid and o.status <> 'cancelled'
    )
    where p.id = pid;

  return null;
end;
$$;

drop trigger if exists order_items_refresh_sold on public.order_items;
create trigger order_items_refresh_sold
  after insert or update or delete on public.order_items
  for each row execute function public.refresh_product_sold();

-- ===========================================================================
-- POS SALE — cash at the counter. Stock leaves immediately, drawer goes up.
-- p_items: [{ "variant_id": uuid, "quantity": int, "unit_price": numeric? }]
--          unit_price is optional and only honoured for staff (manual override)
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
  o           public.orders;
  line        jsonb;
  v           public.product_variants;
  prod        public.products;
  qty         int;
  price       numeric(12,2);
  cost        numeric(12,2);
  line_total  numeric(12,2);
  v_subtotal  numeric(12,2) := 0;
  v_discount  numeric(12,2) := 0;
  disc        jsonb;
  disc_id     uuid;
  avail       int;
  img         text;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to take a sale';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot create an empty sale';
  end if;

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

    -- Lock the stock row so two tills can't sell the same last piece.
    select public.available_qty(l) into avail
    from public.inventory_levels l
    where l.variant_id = v.id and l.location_id = p_location_id
    for update;

    if coalesce(avail, 0) < qty then
      raise exception 'Not enough stock for % (%): % available, % requested',
        prod.name_en, v.sku, coalesce(avail, 0), qty;
    end if;

    price := coalesce((line->>'unit_price')::numeric, v.price, prod.price);
    cost  := coalesce(v.cost_price, prod.cost_price, 0);
    line_total := round(price * qty - coalesce((line->>'discount')::numeric, 0), 2);

    select url into img from public.product_images
      where product_id = prod.id order by position limit 1;

    insert into public.order_items (
      order_id, variant_id, product_id, product_name, variant_label, sku,
      size, color_name, image_url, unit_price, unit_cost, quantity, discount, total
    ) values (
      o.id, v.id, prod.id, prod.name_en,
      nullif(concat_ws(' / ', v.size, v.color_name), ''), v.sku,
      v.size, v.color_name, img, price, cost, qty,
      coalesce((line->>'discount')::numeric, 0), line_total
    );

    -- Stock out, immediately.
    insert into public.inventory_movements
      (variant_id, location_id, delta, reason, reference_type, reference_id, unit_cost, created_by)
    values
      (v.id, p_location_id, -qty, 'sale', 'order', o.id, cost, auth.uid());

    v_subtotal := v_subtotal + line_total;
  end loop;

  -- Discounts: a code, plus/or a manual amount the cashier keys in.
  if p_discount_code is not null and btrim(p_discount_code) <> '' then
    disc := public.validate_discount(p_discount_code, v_subtotal, p_customer_id);
    if (disc->>'valid')::boolean then
      v_discount := (disc->>'amount')::numeric;
      disc_id    := (disc->>'discount_id')::uuid;
      update public.discounts set used_count = used_count + 1 where id = disc_id;
    else
      raise exception 'Discount code rejected: %', disc->>'reason';
    end if;
  end if;

  v_discount := least(v_subtotal, v_discount + greatest(coalesce(p_manual_discount, 0), 0));

  update public.orders set
    subtotal       = v_subtotal,
    discount_total = v_discount,
    discount_id    = disc_id,
    discount_code  = case when disc_id is not null then p_discount_code else null end,
    total          = round(v_subtotal - v_discount, 2),
    amount_paid    = round(v_subtotal - v_discount, 2),
    amount_tendered = p_amount_tendered,
    change_given   = case
                       when p_amount_tendered is null then null
                       else round(p_amount_tendered - (v_subtotal - v_discount), 2)
                     end,
    completed_at   = now()
  where id = o.id
  returning * into o;

  -- Cash into the drawer.
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
-- ONLINE ORDER — cash on delivery / pay on pickup.
-- Callable by guests. Prices are ALWAYS read from the database.
-- ===========================================================================
create or replace function public.create_online_order(
  p_items         jsonb,     -- [{ "variant_id": uuid, "quantity": int }]
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
  pay_method  public.payment_method;
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

  -- Which branch fulfils this?
  loc := coalesce(
    p_location_id,
    (select id from public.locations
      where is_active and sells_online
      order by position, created_at limit 1)
  );
  if loc is null then
    raise exception 'No branch is available to fulfil online orders';
  end if;

  -- Match or create the customer by phone.
  select id into cust from public.customers
    where phone = btrim(p_contact_phone) limit 1;

  if cust is null then
    insert into public.customers (full_name, phone, email, user_id)
    values (btrim(p_contact_name), btrim(p_contact_phone), nullif(btrim(coalesce(p_contact_email,'')), ''), auth.uid())
    returning id into cust;
  elsif auth.uid() is not null then
    update public.customers set user_id = coalesce(user_id, auth.uid()) where id = cust;
  end if;

  if exists (select 1 from public.customers where id = cust and is_blocked) then
    raise exception 'This account cannot place orders. Please contact the store.';
  end if;

  -- An untyped CASE resolves to text and will NOT implicitly cast to the enum,
  -- so assign it to a typed variable first.
  pay_method := (case when p_fulfillment = 'pickup' then 'cash'
                      else 'cash_on_delivery' end)::public.payment_method;

  insert into public.orders (
    order_number, channel, status, payment_status, payment_method, fulfillment,
    customer_id, location_id, contact_name, contact_phone, contact_email,
    shipping_address, notes
  ) values (
    public.next_order_number(), 'online', 'pending', 'unpaid',
    pay_method,
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

    -- Never trust a price from the browser.
    price := coalesce(v.price, prod.price);
    cost  := coalesce(v.cost_price, prod.cost_price, 0);

    select url into img from public.product_images
      where product_id = prod.id order by position limit 1;

    insert into public.order_items (
      order_id, variant_id, product_id, product_name, variant_label, sku,
      size, color_name, image_url, unit_price, unit_cost, quantity, total
    ) values (
      o.id, v.id, prod.id, prod.name_en,
      nullif(concat_ws(' / ', v.size, v.color_name), ''), v.sku,
      v.size, v.color_name, img, price, cost, qty, round(price * qty, 2)
    );

    -- Hold the stock rather than removing it.
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

  -- Shipping: flat fee, free above a threshold. Both come from settings.
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
  values ('new_order', 'info', 'New online order',
          o.order_number || ' — ' || o.total::text,
          'order', o.id, '/admin/orders/' || o.id);

  return o;
end;
$$;

-- ===========================================================================
-- Order lifecycle
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

  -- Online orders were holding stock; turn that hold into a real deduction.
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

  -- Cash collected (on delivery or at pickup) lands in the drawer.
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
  o    public.orders;
  item record;
begin
  if not public.is_staff() then
    raise exception 'Not authorised';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o is null then raise exception 'Order not found'; end if;
  if o.status = 'cancelled' then return o; end if;

  if o.channel = 'online' and o.status <> 'completed' then
    -- Stock was only reserved — just let it go.
    perform public.release_reservation(p_order_id);
  else
    -- Stock had physically left; put it back.
    for item in
      select variant_id, quantity, unit_cost from public.order_items
      where order_id = p_order_id and variant_id is not null
    loop
      insert into public.inventory_movements
        (variant_id, location_id, delta, reason, reference_type, reference_id, unit_cost, created_by)
      values
        (item.variant_id, o.location_id, item.quantity, 'cancellation', 'order', o.id,
         item.unit_cost, auth.uid());
    end loop;

    -- Money back out of the drawer.
    if o.shift_id is not null and o.amount_paid > 0 then
      insert into public.cash_movements (shift_id, type, amount, reason, order_id, created_by)
      values (o.shift_id, 'refund', -o.amount_paid,
              'Cancelled ' || o.order_number, o.id, auth.uid());
    end if;
  end if;

  -- Claw back loyalty points and free up the discount code.
  if o.points_earned > 0 and o.customer_id is not null then
    insert into public.loyalty_transactions (customer_id, points, reason, order_id, note)
    values (o.customer_id, -o.points_earned, 'order_cancelled', o.id, 'Order cancelled');
  end if;

  if o.discount_id is not null then
    update public.discounts set used_count = greatest(used_count - 1, 0) where id = o.discount_id;
  end if;

  update public.orders set
    status         = 'cancelled',
    cancel_reason  = p_reason,
    payment_status = case when amount_paid > 0 then 'refunded' else payment_status end,
    amount_refunded = amount_paid,
    points_earned  = 0
  where id = p_order_id
  returning * into o;

  return o;
end;
$$;

-- ===========================================================================
-- Returns — cash refund, optionally putting the goods back on the shelf.
-- p_lines: [{ "order_item_id": uuid, "quantity": int, "restock": bool }]
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
  o        public.orders;
  r        public.returns;
  line     jsonb;
  oi       public.order_items;
  qty      int;
  restock  boolean;
  refund   numeric(12,2) := 0;
  ref      text;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to process returns';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o is null then raise exception 'Order not found'; end if;
  if o.status = 'cancelled' then raise exception 'Order was cancelled'; end if;

  ref := 'RT-' || nextval('public.order_number_seq')::text;

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

    insert into public.return_items (return_id, order_item_id, variant_id, quantity, unit_price, restock)
    values (r.id, oi.id, oi.variant_id, qty, oi.unit_price, restock);

    update public.order_items
      set quantity_returned = quantity_returned + qty
      where id = oi.id;

    if restock and oi.variant_id is not null and o.location_id is not null then
      insert into public.inventory_movements
        (variant_id, location_id, delta, reason, reference_type, reference_id, unit_cost, created_by)
      values
        (oi.variant_id, o.location_id, qty, 'return', 'return', r.id, oi.unit_cost, auth.uid());
    end if;

    refund := refund + round(oi.unit_price * qty, 2);
  end loop;

  if refund <= 0 then
    raise exception 'Nothing was returned';
  end if;

  update public.returns set refund_amount = refund where id = r.id returning * into r;

  update public.orders set
    amount_refunded = amount_refunded + refund,
    payment_status  = case
      when amount_refunded + refund >= total then 'refunded'::public.payment_status
      else 'partially_refunded'::public.payment_status
    end
  where id = p_order_id;

  -- Cash out of the drawer.
  if coalesce(p_shift_id, o.shift_id) is not null then
    insert into public.cash_movements (shift_id, type, amount, reason, order_id, created_by)
    values (coalesce(p_shift_id, o.shift_id), 'refund', -refund,
            'Refund ' || r.reference, o.id, auth.uid());
  end if;

  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Redeem loyalty points for a cash discount.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_points(
  p_customer_id uuid,
  p_points      int
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  balance int;
  cfg     jsonb;
  rate    numeric;
begin
  if not public.is_staff() then
    raise exception 'Not authorised';
  end if;
  if p_points <= 0 then
    raise exception 'Points must be positive';
  end if;

  select loyalty_points into balance from public.customers where id = p_customer_id for update;
  if balance is null then raise exception 'Customer not found'; end if;
  if balance < p_points then
    raise exception 'Not enough points: balance is %', balance;
  end if;

  cfg  := public.get_setting('loyalty', '{"currency_per_point": 0.1}'::jsonb);
  rate := coalesce((cfg->>'currency_per_point')::numeric, 0.1);

  insert into public.loyalty_transactions (customer_id, points, reason, note)
  values (p_customer_id, -p_points, 'redemption', p_points || ' points redeemed');

  return round(p_points * rate, 2);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Guests need to be able to check out and validate a code.
-- ---------------------------------------------------------------------------
grant execute on function public.create_online_order(jsonb, text, text, public.fulfillment_type, text, jsonb, text, text, uuid) to anon, authenticated;
grant execute on function public.validate_discount(text, numeric, uuid) to anon, authenticated;
grant execute on function public.get_setting(text, jsonb) to anon, authenticated;

grant execute on function public.create_pos_sale(uuid, jsonb, uuid, uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.complete_order(uuid, uuid)   to authenticated;
grant execute on function public.cancel_order(uuid, text)     to authenticated;
grant execute on function public.process_return(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.redeem_points(uuid, int)     to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, int, public.movement_reason, text) to authenticated;
grant execute on function public.set_stock(uuid, uuid, int, text) to authenticated;
grant execute on function public.open_shift(uuid, numeric)    to authenticated;
grant execute on function public.close_shift(uuid, numeric, text) to authenticated;
grant execute on function public.shift_expected_cash(uuid)    to authenticated;
grant execute on function public.record_cash_movement(uuid, public.cash_movement_type, numeric, text) to authenticated;
grant execute on function public.receive_purchase_order(uuid, jsonb) to authenticated;
grant execute on function public.complete_stock_transfer(uuid) to authenticated;
