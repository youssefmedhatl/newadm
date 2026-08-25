-- ===========================================================================
-- 0021_revoke_cost_columns.sql
--
-- Closes the leak: products.cost_price and product_variants.cost_price are no
-- longer readable or writable by any client role. Cost is read and written via
-- product_costs / variant_costs (0019), which are staff-only under RLS.
--
-- DEVIATION FROM THE PLAN (recorded in docs/EXECUTION_LOG.md step 2.4):
-- the plan specified only
--     revoke select (cost_price) on public.products from authenticated, anon;
-- but `authenticated` holds TABLE-LEVEL select/insert/update on both tables
-- (verified via information_schema.table_privileges). In PostgreSQL a
-- column-level REVOKE does not cut into a table-level grant — the table grant
-- keeps conferring the privilege on every column, so those statements alone
-- would have left the leak wide open. The only way to restrict a column is to
-- drop the table-level grant and re-grant an explicit column list.
--
-- The plan's column-level revokes are kept first: they are harmless and clear
-- any column-level grant that may also exist.
--
-- `anon` holds no select/insert/update on either table (0016 locked the public
-- role down), so it needs no column list.
--
-- The columns themselves still exist. Dropping them is deferred until the cost
-- separation has been reviewed — see PENDING_0031_drop_cost_columns.sql.txt.
--
-- Reminder: any remaining `select('*')` against these two tables from a client
-- role will now FAIL, because SELECT * requires privileges on every column.
-- Every call site in src/ was checked and already uses an explicit list.
-- ===========================================================================

revoke select (cost_price) on public.products         from authenticated, anon;
revoke select (cost_price) on public.product_variants from authenticated, anon;
revoke insert (cost_price), update (cost_price) on public.products         from authenticated, anon;
revoke insert (cost_price), update (cost_price) on public.product_variants from authenticated, anon;

-- Replace the table-level grants with explicit column lists that omit cost_price.
revoke select, insert, update on public.products         from authenticated;
revoke select, insert, update on public.product_variants from authenticated;

grant select, insert, update (
  id, slug, name_en, name_ar, description_en, description_ar, category_id,
  brand_id, status, price, compare_at_price, is_featured, is_new, tags,
  material_en, material_ar, care_en, care_ar, seo_title, seo_description,
  rating_avg, rating_count, total_sold, published_at, created_by,
  created_at, updated_at
) on public.products to authenticated;

grant select, insert, update (
  id, product_id, sku, barcode, size, color_name, color_hex, price,
  weight_grams, "position", is_active, created_at, updated_at
) on public.product_variants to authenticated;
