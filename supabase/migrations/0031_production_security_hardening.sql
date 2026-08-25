-- ===========================================================================
-- 0031_production_security_hardening.sql
--
-- Production security hardening:
--   * enforce server-side role boundaries matching the admin permission model
--   * make POS pricing authoritative on the database
--   * prevent direct mutation of transactional state tables
--   * revoke future public-schema exposure by default
--   * remove unused point-mutation RPC entry points
-- ===========================================================================

-- Never allow browser roles to create objects in the exposed public schema.
revoke create on schema public from anon, authenticated;

-- Future migrations must explicitly expose new objects.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;


-- Harden create_pos_sale
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
  if not public.has_role(array['owner','manager','cashier']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_sale';
  end if;

  if not exists (select 1 from public.locations
                  where id = p_location_id and is_active) then
    raise exception 'branch_unavailable';
  end if;

  perform public.assert_shift_usable(p_shift_id, p_location_id);

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
      raise exception 'invalid_quantity';
    end if;

    select * into v from public.product_variants where id = (line->>'variant_id')::uuid and is_active;
    if v is null then
      raise exception 'variant_not_found' using detail = coalesce(line->>'variant_id', '');
    end if;

    select * into prod from public.products where id = v.product_id and status = 'active';

    select public.available_qty(l) into avail
    from public.inventory_levels l
    where l.variant_id = v.id and l.location_id = p_location_id
    for update;

    if coalesce(avail, 0) < qty then
      raise exception 'insufficient_stock'
        using detail = format('%s|%s|%s', coalesce(avail, 0), prod.name_en,
          coalesce(nullif(concat_ws(' / ', v.size, v.color_name), ''), v.sku));
    end if;

    price := coalesce(v.price, prod.price);

    select coalesce(vc.cost_price, pc.cost_price, 0) into cost
    from (select 1) as _(x)
    left join public.variant_costs vc on vc.variant_id = v.id
    left join public.product_costs  pc on pc.product_id = prod.id;

    line_discount := greatest(coalesce((line->>'discount')::numeric, 0), 0);
    line_total    := round(price * qty, 2);
    line_discount := least(line_discount, line_total);

    -- A cashier may not bypass the configured manual-discount ceiling by
    -- moving the discount into an individual order line. Manager/owner
    -- approval is required for discounts above the configured percentage.
    if line_discount > 0 and not public.is_manager() then
      cap_pct := coalesce(
        (public.get_setting('pos', '{"max_cashier_discount_pct": 10}'::jsonb)
          ->>'max_cashier_discount_pct')::numeric, 10);
      if line_discount > round(line_total * cap_pct / 100.0, 2) then
        raise exception 'manager_approval_required' using detail = cap_pct::text;
      end if;
    end if;

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
      raise exception 'discount_rejected' using detail = coalesce(disc->>'reason', '');
    end if;
  end if;

  v_manual := greatest(coalesce(p_manual_discount, 0), 0);
  if v_manual > 0 and not public.is_manager() then
    cap_pct := coalesce(
      (public.get_setting('pos', '{"max_cashier_discount_pct": 10}'::jsonb)
        ->>'max_cashier_discount_pct')::numeric, 10);
    if v_manual > round(v_subtotal * cap_pct / 100.0, 2) then
      raise exception 'manager_approval_required' using detail = cap_pct::text;
    end if;
  end if;

  v_discount := least(v_subtotal, v_discount + v_linedisc + v_manual);

  if coalesce(p_redeem_points, 0) > 0 then
    if p_customer_id is null then
      raise exception 'customer_not_found';
    end if;

    select loyalty_points into v_balance
    from public.customers where id = p_customer_id for update;

    if v_balance is null then
      raise exception 'customer_not_found';
    end if;
    if v_balance < p_redeem_points then
      raise exception 'insufficient_points' using detail = v_balance::text;
    end if;

    v_rate := coalesce(
      (public.get_setting('loyalty', '{"currency_per_point": 0.1}'::jsonb)
        ->>'currency_per_point')::numeric, 0.1);

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
    raise exception 'tendered_below_total'
      using detail = format('%s|%s', p_amount_tendered, v_total);
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

-- Harden complete_order
CREATE OR REPLACE FUNCTION public.complete_order(p_order_id uuid, p_shift_id uuid DEFAULT NULL::uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.orders;
begin
  if not public.has_role(array['owner','manager','cashier','stock']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o is null then raise exception 'order_not_found'; end if;
  if o.status = 'completed' then return o; end if;
  if o.status = 'cancelled' then raise exception 'order_cancelled'; end if;

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
$function$;

-- Harden cancel_order
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o           public.orders;
  item        record;
  outstanding numeric(12,2);
  still_out   int;
begin
  if not public.has_role(array['owner','manager','cashier','stock']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o is null then raise exception 'order_not_found'; end if;
  if o.status = 'cancelled' then return o; end if;

  if o.channel = 'online' and o.status <> 'completed' then
    perform public.release_reservation(p_order_id);
  else
    for item in
      select variant_id, quantity, quantity_returned, unit_cost
      from public.order_items
      where order_id = p_order_id and variant_id is not null
    loop
      still_out := item.quantity - coalesce(item.quantity_returned, 0);
      if still_out > 0 then
        insert into public.inventory_movements
          (variant_id, location_id, delta, reason, reference_type, reference_id, unit_cost, created_by)
        values
          (item.variant_id, o.location_id, still_out, 'cancellation', 'order', o.id,
           item.unit_cost, auth.uid());
      end if;
    end loop;

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

  -- Points spent on this order go back to the customer. Without this the
  -- redemption would simply vanish when the sale is unwound.
  if o.points_redeemed > 0 and o.customer_id is not null then
    insert into public.loyalty_transactions (customer_id, points, reason, order_id, note)
    values (o.customer_id, o.points_redeemed, 'redemption_reversal', o.id,
            'Order cancelled');
  end if;

  if o.discount_id is not null then
    update public.discounts set used_count = greatest(used_count - 1, 0) where id = o.discount_id;
  end if;

  update public.orders set
    status          = 'cancelled',
    cancel_reason   = p_reason,
    payment_status  = case when amount_paid > 0 then 'refunded' else payment_status end,
    amount_refunded = greatest(coalesce(amount_refunded, 0), coalesce(amount_paid, 0)),
    points_earned   = 0,
    points_redeemed = 0
  where id = p_order_id
  returning * into o;

  return o;
end;
$function$;

-- Harden process_return
CREATE OR REPLACE FUNCTION public.process_return(p_order_id uuid, p_lines jsonb, p_reason text DEFAULT NULL::text, p_shift_id uuid DEFAULT NULL::uuid)
 RETURNS returns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not public.has_role(array['owner','manager','cashier','stock']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if o is null then raise exception 'order_not_found'; end if;
  if o.status = 'cancelled' then raise exception 'order_cancelled'; end if;

  if coalesce(o.amount_paid, 0) <= 0 then
    raise exception 'order_unpaid';
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
      raise exception 'line_not_in_order';
    end if;

    if qty > oi.quantity - oi.quantity_returned then
      raise exception 'return_exceeds_line'
        using detail = format('%s|%s|%s', qty, oi.product_name, oi.quantity - oi.quantity_returned);
    end if;

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
    raise exception 'nothing_returned';
  end if;

  refundable := round(coalesce(o.amount_paid, 0) - coalesce(o.amount_refunded, 0), 2);
  refund     := least(refund, greatest(refundable, 0));

  if refund <= 0 then
    raise exception 'already_refunded';
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
$function$;

-- Harden adjust_stock
CREATE OR REPLACE FUNCTION public.adjust_stock(p_variant_id uuid, p_location_id uuid, p_delta integer, p_reason movement_reason DEFAULT 'adjustment'::movement_reason, p_note text DEFAULT NULL::text)
 RETURNS inventory_levels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result public.inventory_levels;
begin
  if not public.has_role(array['owner','manager','stock']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;
  if p_delta = 0 then
    raise exception 'invalid_adjustment';
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
$function$;

-- Harden set_stock
CREATE OR REPLACE FUNCTION public.set_stock(p_variant_id uuid, p_location_id uuid, p_counted integer, p_note text DEFAULT NULL::text)
 RETURNS inventory_levels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_qty int;
  diff        int;
  result      public.inventory_levels;
begin
  if not public.has_role(array['owner','manager','stock']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;
  if p_counted < 0 then
    raise exception 'invalid_count';
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
    insert into public.inventory_levels (variant_id, location_id, quantity)
    values (p_variant_id, p_location_id, p_counted)
    on conflict (variant_id, location_id) do nothing;
  end if;

  select * into result
  from public.inventory_levels
  where variant_id = p_variant_id and location_id = p_location_id;

  return result;
end;
$function$;

-- Harden receive_purchase_order
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_po_id uuid, p_lines jsonb)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  po        public.purchase_orders;
  line      jsonb;
  item      public.purchase_order_items;
  qty       int;
  remaining int;
begin
  if not public.has_role(array['owner','manager','stock']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;

  select * into po from public.purchase_orders where id = p_po_id for update;
  if po is null then
    raise exception 'purchase_order_not_found';
  end if;
  if po.status in ('received','cancelled') then
    raise exception 'purchase_order_closed' using detail = po.status::text;
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
      raise exception 'line_not_in_purchase_order' using detail = coalesce(line->>'item_id', '');
    end if;

    remaining := item.quantity_ordered - item.quantity_received;
    if qty > remaining then
      qty := remaining;
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
$function$;

-- Harden complete_stock_transfer
CREATE OR REPLACE FUNCTION public.complete_stock_transfer(p_transfer_id uuid)
 RETURNS stock_transfers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t    public.stock_transfers;
  item record;
begin
  if not public.has_role(array['owner','manager','stock']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;

  select * into t from public.stock_transfers where id = p_transfer_id for update;
  if t is null then
    raise exception 'transfer_not_found';
  end if;
  if t.status = 'received' then
    raise exception 'transfer_received';
  end if;
  if t.status = 'cancelled' then
    raise exception 'transfer_cancelled';
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
$function$;

-- Harden open_shift
CREATE OR REPLACE FUNCTION public.open_shift(p_location_id uuid, p_opening_float numeric DEFAULT 0)
 RETURNS shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.shifts;
begin
  if not public.has_role(array['owner','manager','cashier']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;
  if exists (select 1 from public.shifts where location_id = p_location_id and status = 'open') then
    raise exception 'shift_already_open';
  end if;

  insert into public.shifts (location_id, opened_by, opening_float)
  values (p_location_id, auth.uid(), coalesce(p_opening_float, 0))
  returning * into s;

  if s.opening_float > 0 then
    insert into public.cash_movements (shift_id, type, amount, reason, created_by)
    values (s.id, 'opening_float', s.opening_float, 'Opening float', auth.uid());
  end if;

  return s;
end;
$function$;

-- Harden close_shift
CREATE OR REPLACE FUNCTION public.close_shift(p_shift_id uuid, p_counted_cash numeric, p_notes text DEFAULT NULL::text)
 RETURNS shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s        public.shifts;
  expected numeric;
begin
  if not public.has_role(array['owner','manager','cashier']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;

  select * into s from public.shifts where id = p_shift_id for update;
  if s is null then
    raise exception 'shift_missing';
  end if;
  if s.status = 'closed' then
    raise exception 'shift_closed';
  end if;

  expected := public.shift_expected_cash(p_shift_id);

  update public.shifts
    set status        = 'closed',
        closed_by     = auth.uid(),
        closed_at     = now(),
        counted_cash  = p_counted_cash,
        expected_cash = expected,
        variance      = p_counted_cash - expected,
        notes         = coalesce(p_notes, notes)
    where id = p_shift_id
    returning * into s;

  return s;
end;
$function$;

-- Harden record_cash_movement
CREATE OR REPLACE FUNCTION public.record_cash_movement(p_shift_id uuid, p_type cash_movement_type, p_amount numeric, p_reason text DEFAULT NULL::text)
 RETURNS cash_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.cash_movements;
begin
  if not public.has_role(array['owner','manager','cashier']::public.app_role[]) then
    raise exception 'not_authorised';
  end if;
  if p_type not in ('pay_in','pay_out') then
    raise exception 'invalid_cash_movement_type';
  end if;
  if p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  insert into public.cash_movements (shift_id, type, amount, reason, created_by)
  values (
    p_shift_id,
    p_type,
    case when p_type = 'pay_out' then -p_amount else p_amount end,
    p_reason,
    auth.uid()
  )
  returning * into m;

  return m;
end;
$function$;

-- These functions are explicitly deprecated and have no current frontend caller.
-- Keeping them executable would leave an unnecessary high-impact mutation surface.
revoke execute on function public.redeem_points(uuid, integer) from public, anon, authenticated;
revoke execute on function public.reverse_redemption(uuid, integer, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Direct-write policy hardening.
-- ---------------------------------------------------------------------------

-- Product/catalogue writes match the "products" permission.
drop policy if exists products_staff_write on public.products;
create policy products_staff_write on public.products
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists variants_staff_write on public.product_variants;
create policy variants_staff_write on public.product_variants
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists images_staff_write on public.product_images;
create policy images_staff_write on public.product_images
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists categories_staff_write on public.categories;
create policy categories_staff_write on public.categories
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists brands_staff_write on public.brands;
create policy brands_staff_write on public.brands
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

-- CMS is manager/owner territory.
drop policy if exists collections_staff_write on public.collections;
create policy collections_staff_write on public.collections
  for all to authenticated
  using (public.has_role(array['owner','manager']::public.app_role[]))
  with check (public.has_role(array['owner','manager']::public.app_role[]));

drop policy if exists collection_products_staff_write on public.collection_products;
create policy collection_products_staff_write on public.collection_products
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists locations_manager_write on public.locations;
create policy locations_manager_write on public.locations
  for all to authenticated
  using (public.has_role(array['owner','manager']::public.app_role[]))
  with check (public.has_role(array['owner','manager']::public.app_role[]));

-- Inventory/purchasing writes.
drop policy if exists inv_levels_staff_write on public.inventory_levels;
create policy inv_levels_staff_write on public.inventory_levels
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists inv_moves_staff on public.inventory_movements;
create policy inv_moves_staff on public.inventory_movements
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists suppliers_staff on public.suppliers;
create policy suppliers_staff on public.suppliers
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists purchase_orders_staff on public.purchase_orders;
create policy purchase_orders_staff on public.purchase_orders
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists purchase_order_items_staff on public.purchase_order_items;
create policy purchase_order_items_staff on public.purchase_order_items
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists stock_transfers_staff on public.stock_transfers;
create policy stock_transfers_staff on public.stock_transfers
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

drop policy if exists stock_transfer_items_staff on public.stock_transfer_items;
create policy stock_transfer_items_staff on public.stock_transfer_items
  for all to authenticated
  using (public.has_role(array['owner','manager','stock']::public.app_role[]))
  with check (public.has_role(array['owner','manager','stock']::public.app_role[]));

-- Cost tables are manager-only because they are commercially sensitive.
drop policy if exists product_costs_staff on public.product_costs;
create policy product_costs_staff on public.product_costs
  for all to authenticated
  using (public.has_role(array['owner','manager']::public.app_role[]))
  with check (public.has_role(array['owner','manager']::public.app_role[]));

drop policy if exists variant_costs_staff on public.variant_costs;
create policy variant_costs_staff on public.variant_costs
  for all to authenticated
  using (public.has_role(array['owner','manager']::public.app_role[]))
  with check (public.has_role(array['owner','manager']::public.app_role[]));

-- High-integrity order/cash state is mutated only through the transactional RPCs.
drop policy if exists orders_staff_write on public.orders;
drop policy if exists order_items_staff_write on public.order_items;
drop policy if exists order_events_staff_write on public.order_events;
drop policy if exists returns_staff on public.returns;
drop policy if exists return_items_staff on public.return_items;
drop policy if exists shifts_staff on public.shifts;
drop policy if exists cash_moves_staff on public.cash_movements;

-- Financial settings / CMS manager-only.
drop policy if exists settings_manager_write on public.settings;
create policy settings_manager_write on public.settings
  for all to authenticated
  using (public.has_role(array['owner','manager']::public.app_role[]))
  with check (public.has_role(array['owner','manager']::public.app_role[]));

drop policy if exists content_staff_write on public.content_blocks;
create policy content_staff_write on public.content_blocks
  for all to authenticated
  using (public.has_role(array['owner','manager']::public.app_role[]))
  with check (public.has_role(array['owner','manager']::public.app_role[]));

drop policy if exists marquee_staff_write on public.marquee_messages;
create policy marquee_staff_write on public.marquee_messages
  for all to authenticated
  using (public.has_role(array['owner','manager']::public.app_role[]))
  with check (public.has_role(array['owner','manager']::public.app_role[]));

-- Expense creation is financial and therefore manager-only.
drop policy if exists expenses_staff_insert on public.expenses;
create policy expenses_staff_insert on public.expenses
  for insert to authenticated
  with check (public.has_role(array['owner','manager']::public.app_role[]));

-- Staff records remain manager-only.
drop policy if exists profiles_owner_write on public.profiles;
create policy profiles_owner_write on public.profiles
  for all to authenticated
  using (public.has_role(array['owner','manager']::public.app_role[]))
  with check (public.has_role(array['owner','manager']::public.app_role[]));

-- Staff/customer read paths stay as previously defined. Self-update policies
-- continue to protect users from changing their own role/active state.


-- Protect catalog prices from non-manager staff who still legitimately need
-- to update inventory/catalog records. Price changes are financial controls,
-- not ordinary stock-management fields, so enforce the rule at the database
-- boundary in addition to the UI.
CREATE OR REPLACE FUNCTION public.protect_catalog_prices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF public.auth_role() NOT IN ('owner','manager') THEN
    IF TG_TABLE_NAME = 'products'
       AND (NEW.price IS DISTINCT FROM OLD.price) THEN
      RAISE EXCEPTION 'manager_required';
    END IF;

    IF TG_TABLE_NAME = 'product_variants'
       AND (NEW.price IS DISTINCT FROM OLD.price) THEN
      RAISE EXCEPTION 'manager_required';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_catalog_prices() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_products_price ON public.products;
CREATE TRIGGER protect_products_price
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.protect_catalog_prices();

DROP TRIGGER IF EXISTS protect_product_variants_price ON public.product_variants;
CREATE TRIGGER protect_product_variants_price
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.protect_catalog_prices();
