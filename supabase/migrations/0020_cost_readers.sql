-- ===========================================================================
-- 0020_cost_readers.sql
--
-- Point everything that reads cost at the new product_costs / variant_costs
-- tables introduced in 0019. Output column names are deliberately unchanged so
-- the admin screens that consume these views need no edit.
--
-- NOTE: v_product_performance was inspected and does NOT read cost_price — it
-- computes cost from order_items.unit_cost, which is a historical snapshot
-- written at sale time. It therefore needs no change and is left alone.
--
-- NOTE: receive_purchase_order was inspected and does NOT write
-- product_variants.cost_price — it only writes inventory_movements.unit_cost
-- from purchase_order_items.unit_cost. It therefore needs no change either.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- v_variant_stock
-- ---------------------------------------------------------------------------
create or replace view public.v_variant_stock with (security_invoker = true) as
 SELECT v.id AS variant_id,
    v.product_id,
    v.sku,
    v.barcode,
    v.size,
    v.color_name,
    v.color_hex,
    v.is_active,
    p.name_en AS product_name_en,
    p.name_ar AS product_name_ar,
    p.status AS product_status,
    COALESCE(v.price, p.price) AS price,
    COALESCE(vc.cost_price, pc.cost_price) AS cost_price,
    COALESCE(sum(l.quantity), 0::bigint)::integer AS on_hand,
    COALESCE(sum(l.reserved), 0::bigint)::integer AS reserved,
    GREATEST(COALESCE(sum(l.quantity - l.reserved), 0::bigint), 0::bigint)::integer AS available,
    min(l.reorder_point) AS reorder_point
   FROM product_variants v
     JOIN products p ON p.id = v.product_id
     LEFT JOIN public.variant_costs vc ON vc.variant_id = v.id
     LEFT JOIN public.product_costs pc ON pc.product_id = p.id
     LEFT JOIN inventory_levels l ON l.variant_id = v.id
  GROUP BY v.id, p.id, vc.cost_price, pc.cost_price;

-- ---------------------------------------------------------------------------
-- v_inventory_valuation
-- ---------------------------------------------------------------------------
create or replace view public.v_inventory_valuation with (security_invoker = true) as
 SELECT l.location_id,
    loc.name_en AS location_name_en,
    count(DISTINCT v.id) AS variant_count,
    COALESCE(sum(l.quantity), 0::bigint)::integer AS units,
    COALESCE(sum(l.quantity::numeric * COALESCE(vc.cost_price, pc.cost_price)), 0::numeric) AS cost_value,
    COALESCE(sum(l.quantity::numeric * COALESCE(v.price, p.price)), 0::numeric) AS retail_value
   FROM inventory_levels l
     JOIN product_variants v ON v.id = l.variant_id
     JOIN products p ON p.id = v.product_id
     JOIN locations loc ON loc.id = l.location_id
     LEFT JOIN public.variant_costs vc ON vc.variant_id = v.id
     LEFT JOIN public.product_costs pc ON pc.product_id = p.id
  GROUP BY l.location_id, loc.name_en;

-- Re-apply the grants the security review established.
revoke all on public.v_variant_stock from anon;
revoke all on public.v_inventory_valuation from anon;
revoke all on public.v_product_performance from anon;
grant select on public.v_variant_stock to authenticated;
grant select on public.v_inventory_valuation to authenticated;
grant select on public.v_product_performance to authenticated;

-- ---------------------------------------------------------------------------
-- create_pos_sale — live definition, cost lookup repointed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pos_sale(p_location_id uuid, p_items jsonb, p_shift_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_discount_code text DEFAULT NULL::text, p_manual_discount numeric DEFAULT 0, p_amount_tendered numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    price := coalesce((line->>'unit_price')::numeric, v.price, prod.price);

    -- Cost now lives in the protected cost tables, not on the product row.
    select coalesce(vc.cost_price, pc.cost_price, 0) into cost
    from (select 1) as _(x)
    left join public.variant_costs vc on vc.variant_id = v.id
    left join public.product_costs  pc on pc.product_id = prod.id;

    line_discount := greatest(coalesce((line->>'discount')::numeric, 0), 0);
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
$function$;

-- ---------------------------------------------------------------------------
-- create_online_order — live definition, cost lookup repointed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_online_order(p_items jsonb, p_contact_name text, p_contact_phone text, p_fulfillment fulfillment_type DEFAULT 'delivery'::fulfillment_type, p_contact_email text DEFAULT NULL::text, p_address jsonb DEFAULT NULL::jsonb, p_discount_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    price := coalesce(v.price, prod.price);

    -- Cost now lives in the protected cost tables, not on the product row.
    select coalesce(vc.cost_price, pc.cost_price, 0) into cost
    from (select 1) as _(x)
    left join public.variant_costs vc on vc.variant_id = v.id
    left join public.product_costs  pc on pc.product_id = prod.id;

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
$function$;

-- Preserve the grants these functions already had.
grant execute on function public.create_pos_sale(uuid, jsonb, uuid, uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.create_online_order(jsonb, text, text, public.fulfillment_type, text, jsonb, text, text, uuid) to anon, authenticated;
