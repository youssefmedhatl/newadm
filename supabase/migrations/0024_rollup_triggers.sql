-- ===========================================================================
-- 0024_rollup_triggers.sql
--
-- refresh_customer_totals and refresh_product_sold both used
-- `coalesce(new.x, old.x)`, so they only ever recalculated ONE id. Reassigning
-- an order to a different customer, or a line to a different product, left the
-- previous owner's rollup permanently stale. Both now recalculate for the old
-- and the new id.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.refresh_customer_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ids uuid[];
begin
  -- Recalculate for BOTH the old and the new owner. coalesce(new, old) left the
  -- previous owner's totals stale whenever an order was reassigned. `old` is
  -- null on INSERT and `new` is null on DELETE; array_remove handles both.
  ids := array_remove(array[old.customer_id, new.customer_id], null);
  if array_length(ids, 1) is null then return null; end if;

  update public.customers c set
    orders_count = (select count(*) from public.orders o
                     where o.customer_id = c.id and o.status <> 'cancelled'),
    total_spent  = (select coalesce(sum(o.total - o.amount_refunded), 0) from public.orders o
                     where o.customer_id = c.id and o.status <> 'cancelled'),
    last_order_at = (select max(o.placed_at) from public.orders o
                     where o.customer_id = c.id and o.status <> 'cancelled')
  where c.id = any(ids);

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_product_sold()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ids uuid[];
begin
  -- Same fix as refresh_customer_totals: recalculate for both ids so moving a
  -- line between products does not leave the old product's total_sold stale.
  ids := array_remove(array[old.product_id, new.product_id], null);
  if array_length(ids, 1) is null then return null; end if;

  update public.products p set
    total_sold = (
      select coalesce(sum(oi.quantity - oi.quantity_returned), 0)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = p.id and o.status <> 'cancelled')
  where p.id = any(ids);

  return null;
end;
$function$;
