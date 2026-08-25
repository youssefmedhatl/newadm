-- ===========================================================================
-- 0016_lock_down_public_role.sql
--
-- Security review 2026-07-29 (docs/SECURITY_REVIEW.md), phases 1 and 2.
--
-- The publishable anon key ships in the JS bundle, so anything the `anon` role
-- can read is public to the internet. Testing as that role showed it could read
-- product cost prices, inventory valuation (cost and retail per branch),
-- per-product profit, and stock for every branch including the Warehouse.
--
-- SEC-01  anon could read products/product_variants.cost_price
-- SEC-02  anon could read v_inventory_valuation
-- SEC-03  anon could read v_product_performance
-- SEC-04  anon could read inventory_levels for non-online branches
-- SEC-05  anon held INSERT/UPDATE/DELETE/TRUNCATE on every table and view
-- SEC-06  settings.is_public defaulted to true (fail-open)
--
-- Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- SEC-02 / SEC-03 — business-intelligence views are staff-only.
-- (They are security_invoker, so RLS already filtered their contents, but
--  v_inventory_valuation and v_product_performance aggregate from tables the
--  public may read, which is how the totals leaked.)
-- ---------------------------------------------------------------------------
revoke all on public.v_inventory_valuation from anon;
revoke all on public.v_product_performance from anon;

-- ---------------------------------------------------------------------------
-- SEC-01 — the public catalogue may read everything about a product EXCEPT
-- what it cost the shop. Column-level grants replace the blanket table grant.
--
-- NOTE: the storefront's `select('*')` calls were rewritten to explicit column
-- lists first — `SELECT *` requires privileges on every column and would start
-- failing the moment one is revoked.
-- ---------------------------------------------------------------------------
revoke select on public.products from anon;
grant select (
  id, slug, name_en, name_ar, description_en, description_ar,
  category_id, brand_id, status, price, compare_at_price,
  is_featured, is_new, tags, material_en, material_ar, care_en, care_ar,
  seo_title, seo_description, rating_avg, rating_count, total_sold,
  published_at, created_at, updated_at
) on public.products to anon;

revoke select on public.product_variants from anon;
grant select (
  id, product_id, sku, barcode, size, color_name, color_hex,
  price, weight_grams, position, is_active, created_at, updated_at
) on public.product_variants to anon;

-- ---------------------------------------------------------------------------
-- SEC-04 — the public may only see stock at branches that actually sell
-- online. The storefront already filters this way (ProductPage, useCart,
-- CartLines), so this changes no behaviour; it stops the Warehouse position
-- being queryable directly with the anon key.
-- ---------------------------------------------------------------------------
drop policy if exists inv_levels_read on public.inventory_levels;
create policy inv_levels_read on public.inventory_levels
  for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.locations l
      where l.id = inventory_levels.location_id
        and l.is_active
        and l.sells_online
    )
  );

-- ---------------------------------------------------------------------------
-- SEC-06 — settings were public unless someone remembered otherwise. Flip the
-- default so a new setting is private until deliberately published. Existing
-- rows keep their current flag.
-- ---------------------------------------------------------------------------
alter table public.settings alter column is_public set default false;

-- ---------------------------------------------------------------------------
-- SEC-05 — anon had INSERT/UPDATE/DELETE/TRUNCATE on everything in `public`.
-- RLS was the only thing standing in the way, and TRUNCATE ignores RLS
-- entirely. Strip the standing privilege; RLS becomes the second line of
-- defence rather than the only one.
--
-- Guest checkout is unaffected: create_online_order is SECURITY DEFINER and
-- does not rely on the caller's table privileges.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename as name from pg_tables where schemaname = 'public'
  loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon', r.name);
    execute format('revoke truncate on public.%I from authenticated', r.name);
  end loop;

  for r in select viewname as name from pg_views where schemaname = 'public'
  loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon', r.name);
    execute format('revoke truncate on public.%I from authenticated', r.name);
  end loop;
end $$;

-- The one anonymous write the storefront legitimately needs. Still governed by
-- the newsletter_insert policy (tightened in 0017).
grant insert on public.newsletter_subscribers to anon;
