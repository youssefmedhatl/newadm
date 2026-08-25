-- ===========================================================================
-- 0015_fix_online_order_payment_method_cast.sql
--
-- Regression fix for 0013. The rewritten create_online_order inlined
--
--   case when p_fulfillment = ''pickup'' then ''cash'' else ''cash_on_delivery'' end
--
-- directly into the INSERT. Both branches are unknown-type literals, so
-- PostgreSQL resolves the CASE to text, and there is no implicit cast from
-- text to the payment_method enum — every online checkout failed with
-- "column payment_method is of type payment_method but expression is of type
-- text". The result is assigned to a typed variable first.
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

grant execute on function public.create_online_order(jsonb, text, text, public.fulfillment_type, text, jsonb, text, text, uuid) to anon, authenticated;
