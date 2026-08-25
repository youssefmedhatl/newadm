-- ===========================================================================
-- 0023_loyalty_and_redemption.sql
--
-- (a) Points are no longer awarded on the delivery fee.
-- (b) Redeemed points stop vanishing. Redemption now happens inside the sale
--     transaction, carries the order id, and can be reversed.
--
-- The 8-argument create_pos_sale signature is DROPPED and replaced by a
-- 9-argument version whose p_redeem_points defaults to 0. Keeping both would
-- make every existing 8-argument call ambiguous. Callers that pass eight
-- arguments are unaffected and redeem nothing.
--
-- NOTE: no POS UI is wired for redemption. There is no points-redemption
-- control anywhere under src/admin/pos/ and no client code calls redeem_points,
-- so per the plan no UI was added. p_redeem_points is dormant until someone
-- builds that control.
-- ===========================================================================

-- (a) No points on shipping.
CREATE OR REPLACE FUNCTION public.award_loyalty_points(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o    public.orders;
  cfg  jsonb;
  rate numeric;
  pts  int;
begin
  select * into o from public.orders where id = p_order_id;
  if o is null or o.customer_id is null or o.points_earned > 0 then
    return 0;
  end if;

  cfg := public.get_setting('loyalty', '{"points_per_currency": 1, "enabled": true}'::jsonb);
  if coalesce((cfg->>'enabled')::boolean, true) is not true then
    return 0;
  end if;

  rate := coalesce((cfg->>'points_per_currency')::numeric, 1);
  -- Delivery fees are not a purchase; they earn nothing.
  pts  := floor(greatest(o.total - coalesce(o.shipping_total, 0), 0) * rate)::int;
  if pts <= 0 then return 0; end if;

  insert into public.loyalty_transactions (customer_id, points, reason, order_id)
  values (o.customer_id, pts, 'order', o.id);

  update public.orders set points_earned = pts where id = o.id;
  return pts;
end;
$function$;

-- (b) Redeemed points must not vanish: a compensating entry when a sale that
-- consumed points is unwound.
CREATE OR REPLACE FUNCTION public.reverse_redemption(p_customer_id uuid, p_points int, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_staff() then
    raise exception 'Not authorised';
  end if;
  if p_points is null or p_points <= 0 then
    raise exception 'Points must be positive';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Customer not found';
  end if;

  insert into public.loyalty_transactions (customer_id, points, reason, note, created_by)
  values (p_customer_id, p_points, 'redemption_reversal',
          coalesce(nullif(btrim(p_note), ''), p_points || ' points returned'),
          auth.uid());

  return p_points;
end;
$function$;

grant execute on function public.reverse_redemption(uuid, int, text) to authenticated;

comment on function public.redeem_points(uuid, integer) is
  'DEPRECATED. Deducts points with no order reference and no way to reverse it. Use create_pos_sale''s p_redeem_points parameter instead, which records the deduction inside the sale transaction against the order. Kept only for backwards compatibility.';

drop function if exists public.create_pos_sale(uuid, jsonb, uuid, uuid, text, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.create_pos_sale(p_location_id uuid, p_items jsonb, p_shift_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_discount_code text DEFAULT NULL::text, p_manual_discount numeric DEFAULT 0, p_amount_tendered numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_redeem_points integer DEFAULT 0)
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
  v_eligible    numeric(12,2) := 0;
  v_manual      numeric(12,2);
  v_total       numeric(12,2);
  disc          jsonb;
  disc_id       uuid;
  avail         int;
  img           text;
  cap_pct       numeric;
  d_prod        uuid;
  d_cat         uuid;
  has_scope     boolean := false;
  v_balance     int;
  v_rate        numeric;
  v_redeem_pts  int := 0;
  v_redeem_val  numeric(12,2) := 0;
  v_remaining   numeric(12,2);
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

  -- Read the discount's scope up front, so the loop knows which lines count.
  if p_discount_code is not null and btrim(p_discount_code) <> '' then
    select applies_to_product_id, applies_to_category_id into d_prod, d_cat
    from public.discounts where upper(code) = upper(btrim(p_discount_code));
    has_scope := (d_prod is not null or d_cat is not null);
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

    -- An unscoped discount applies to everything; a scoped one only to lines
    -- matching its product or category.
    if not has_scope
       or prod.id = d_prod
       or (d_cat is not null and prod.category_id = d_cat) then
      v_eligible := v_eligible + line_total - line_discount;
    end if;
  end loop;

  if p_discount_code is not null and btrim(p_discount_code) <> '' then
    disc := public.validate_discount(p_discount_code, v_subtotal - v_linedisc, p_customer_id, v_eligible);
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

  -- Loyalty redemption, inside the sale transaction so the points and the order
  -- can never disagree. The negative ledger row carries the order id, which is
  -- what makes it reversible (see reverse_redemption).
  if coalesce(p_redeem_points, 0) > 0 then
    if p_customer_id is null then
      raise exception 'Customer not found';
    end if;

    select loyalty_points into v_balance
    from public.customers where id = p_customer_id for update;

    if v_balance is null then
      raise exception 'Customer not found';
    end if;
    if v_balance < p_redeem_points then
      raise exception 'Not enough points: balance is %', v_balance;
    end if;

    v_rate := coalesce(
      (public.get_setting('loyalty', '{"currency_per_point": 0.1}'::jsonb)
        ->>'currency_per_point')::numeric, 0.1);

    -- Never redeem more value than is still payable, and spend only the points
    -- that value actually consumed.
    v_remaining  := greatest(v_subtotal - v_discount, 0);
    v_redeem_pts := p_redeem_points;
    if v_rate > 0 and round(v_redeem_pts * v_rate, 2) > v_remaining then
      v_redeem_pts := floor(v_remaining / v_rate)::int;
    end if;
    v_redeem_val := round(v_redeem_pts * v_rate, 2);

    if v_redeem_pts > 0 then
      insert into public.loyalty_transactions
        (customer_id, points, reason, order_id, note, created_by)
      values
        (p_customer_id, -v_redeem_pts, 'redemption', o.id,
         v_redeem_pts || ' points redeemed', auth.uid());

      v_discount := least(v_subtotal, v_discount + v_redeem_val);
    end if;
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  if p_amount_tendered is not null and p_amount_tendered < v_total then
    raise exception 'Amount tendered (%) is less than the total (%)',
      p_amount_tendered, v_total;
  end if;

  update public.orders set
    subtotal        = v_subtotal,
    discount_total  = v_discount,
    discount_id     = disc_id,
    discount_code   = case when disc_id is not null then p_discount_code else null end,
    points_redeemed = v_redeem_pts,
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

grant execute on function public.create_pos_sale(uuid, jsonb, uuid, uuid, text, numeric, numeric, text, integer) to authenticated;
