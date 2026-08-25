-- ===========================================================================
-- 0009_views.sql — reporting views
--
-- All views are security_invoker so the caller's RLS still applies; a view is
-- never a way around a policy.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Stock per variant, rolled up across every location
-- ---------------------------------------------------------------------------
create or replace view public.v_variant_stock
with (security_invoker = true) as
select
  v.id                as variant_id,
  v.product_id,
  v.sku,
  v.barcode,
  v.size,
  v.color_name,
  v.color_hex,
  v.is_active,
  p.name_en           as product_name_en,
  p.name_ar           as product_name_ar,
  p.status            as product_status,
  coalesce(v.price, p.price)           as price,
  coalesce(v.cost_price, p.cost_price) as cost_price,
  coalesce(sum(l.quantity), 0)::int                            as on_hand,
  coalesce(sum(l.reserved), 0)::int                            as reserved,
  greatest(coalesce(sum(l.quantity - l.reserved), 0), 0)::int  as available,
  min(l.reorder_point)                                          as reorder_point
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.inventory_levels l on l.variant_id = v.id
group by v.id, p.id;

-- ---------------------------------------------------------------------------
-- Anything at or below its reorder point
-- ---------------------------------------------------------------------------
create or replace view public.v_low_stock
with (security_invoker = true) as
select
  l.id            as level_id,
  l.variant_id,
  l.location_id,
  loc.name_en     as location_name_en,
  loc.name_ar     as location_name_ar,
  v.sku,
  v.size,
  v.color_name,
  p.id            as product_id,
  p.name_en       as product_name_en,
  p.name_ar       as product_name_ar,
  l.quantity,
  l.reserved,
  greatest(l.quantity - l.reserved, 0) as available,
  l.reorder_point,
  l.reorder_qty
from public.inventory_levels l
join public.product_variants v on v.id = l.variant_id
join public.products p         on p.id = v.product_id
join public.locations loc      on loc.id = l.location_id
where l.quantity <= l.reorder_point
  and p.status <> 'archived'
  and v.is_active;

-- ---------------------------------------------------------------------------
-- What the stock on the shelves is worth (at cost) and would fetch (at retail)
-- ---------------------------------------------------------------------------
create or replace view public.v_inventory_valuation
with (security_invoker = true) as
select
  l.location_id,
  loc.name_en as location_name_en,
  count(distinct v.id)                                                  as variant_count,
  coalesce(sum(l.quantity), 0)::int                                     as units,
  coalesce(sum(l.quantity * coalesce(v.cost_price, p.cost_price)), 0)   as cost_value,
  coalesce(sum(l.quantity * coalesce(v.price, p.price)), 0)             as retail_value
from public.inventory_levels l
join public.product_variants v on v.id = l.variant_id
join public.products p         on p.id = v.product_id
join public.locations loc      on loc.id = l.location_id
group by l.location_id, loc.name_en;

-- ---------------------------------------------------------------------------
-- Daily sales, split by channel — the backbone of the dashboard chart
-- ---------------------------------------------------------------------------
create or replace view public.v_daily_sales
with (security_invoker = true) as
select
  (o.placed_at at time zone 'UTC')::date as day,
  o.channel,
  o.location_id,
  count(*)                                   as orders,
  coalesce(sum(o.total), 0)                  as revenue,
  coalesce(sum(o.amount_refunded), 0)        as refunded,
  coalesce(sum(o.total - o.amount_refunded), 0) as net_revenue,
  coalesce(sum(o.discount_total), 0)         as discounts,
  coalesce(avg(o.total), 0)                  as avg_order_value
from public.orders o
where o.status <> 'cancelled'
group by 1, 2, 3;

-- ---------------------------------------------------------------------------
-- Per-product performance including margin (needs cost prices to be filled in)
-- ---------------------------------------------------------------------------
create or replace view public.v_product_performance
with (security_invoker = true) as
select
  p.id                as product_id,
  p.name_en,
  p.name_ar,
  p.status,
  c.name_en           as category_name_en,
  coalesce(sum(oi.quantity - oi.quantity_returned), 0)::int          as units_sold,
  coalesce(sum((oi.quantity - oi.quantity_returned) * oi.unit_price), 0) as revenue,
  coalesce(sum((oi.quantity - oi.quantity_returned) * oi.unit_cost), 0)  as cost,
  coalesce(sum((oi.quantity - oi.quantity_returned) * (oi.unit_price - oi.unit_cost)), 0) as profit,
  coalesce(sum(oi.quantity_returned), 0)::int                        as units_returned,
  max(o.placed_at)                                                   as last_sold_at
from public.products p
left join public.categories c   on c.id = p.category_id
left join public.order_items oi on oi.product_id = p.id
left join public.orders o       on o.id = oi.order_id and o.status <> 'cancelled'
group by p.id, c.name_en;

-- ---------------------------------------------------------------------------
-- Hourly heatmap — when is the shop actually busy?
-- ---------------------------------------------------------------------------
create or replace view public.v_sales_by_hour
with (security_invoker = true) as
select
  extract(dow  from o.placed_at)::int as day_of_week,
  extract(hour from o.placed_at)::int as hour_of_day,
  count(*)                            as orders,
  coalesce(sum(o.total), 0)           as revenue
from public.orders o
where o.status <> 'cancelled'
group by 1, 2;

-- ---------------------------------------------------------------------------
-- Staff leaderboard (POS sales per cashier)
-- ---------------------------------------------------------------------------
create or replace view public.v_staff_sales
with (security_invoker = true) as
select
  o.cashier_id,
  pr.full_name  as cashier_name,
  (o.placed_at at time zone 'UTC')::date as day,
  count(*)                   as orders,
  coalesce(sum(o.total), 0)  as revenue
from public.orders o
join public.profiles pr on pr.id = o.cashier_id
where o.channel = 'pos' and o.status <> 'cancelled'
group by 1, 2, 3;

-- ---------------------------------------------------------------------------
-- Storefront product feed: one row per sellable product, with a live
-- availability flag and the primary image. This is what the shop page reads.
-- ---------------------------------------------------------------------------
create or replace view public.v_storefront_products
with (security_invoker = true) as
select
  p.id,
  p.slug,
  p.name_en,
  p.name_ar,
  p.description_en,
  p.description_ar,
  p.price,
  p.compare_at_price,
  p.is_featured,
  p.is_new,
  p.tags,
  p.rating_avg,
  p.rating_count,
  p.total_sold,
  p.published_at,
  p.category_id,
  c.slug     as category_slug,
  c.name_en  as category_name_en,
  c.name_ar  as category_name_ar,
  b.name     as brand_name,
  (
    select url from public.product_images pi
    where pi.product_id = p.id order by pi.position limit 1
  ) as primary_image,
  (
    select coalesce(array_agg(distinct v.size) filter (where v.size is not null), '{}')
    from public.product_variants v where v.product_id = p.id and v.is_active
  ) as sizes,
  (
    select coalesce(array_agg(distinct v.color_name) filter (where v.color_name is not null), '{}')
    from public.product_variants v where v.product_id = p.id and v.is_active
  ) as colors,
  coalesce((
    select sum(greatest(l.quantity - l.reserved, 0))
    from public.inventory_levels l
    join public.product_variants v on v.id = l.variant_id
    where v.product_id = p.id and v.is_active
  ), 0)::int as available_stock
from public.products p
left join public.categories c on c.id = p.category_id
left join public.brands b     on b.id = p.brand_id
where p.status = 'active';

grant select on public.v_storefront_products to anon, authenticated;
grant select on public.v_variant_stock       to authenticated;
grant select on public.v_low_stock           to authenticated;
grant select on public.v_inventory_valuation to authenticated;
grant select on public.v_daily_sales         to authenticated;
grant select on public.v_product_performance to authenticated;
grant select on public.v_sales_by_hour       to authenticated;
grant select on public.v_staff_sales         to authenticated;
