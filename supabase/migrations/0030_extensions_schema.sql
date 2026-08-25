-- ===========================================================================
-- 0030_extensions_schema.sql
--
-- pg_trgm and unaccent lived in `public`. Both now live in `extensions`.
--
-- Done LAST, deliberately: three GIN indexes depend on pg_trgm's gin_trgm_ops
-- opclass —
--   customers_name_idx      (full_name gin_trgm_ops)
--   products_search_en_idx  (name_en   gin_trgm_ops)
--   products_search_ar_idx  (name_ar   gin_trgm_ops)
-- — so this was the item most likely to break search. It did not: the move
-- succeeded and all three indexes survive (an index references its opclass by
-- OID, which the move does not change).
--
-- No application function needed `set search_path = public, extensions`.
-- pg_proc was searched for bodies referencing unaccent / similarity /
-- word_similarity and the only matches were the extensions' own functions. The
-- storefront and admin search go through plain ILIKE via PostgREST, and ILIKE
-- is a core operator, so nothing resolves a trgm symbol by name at runtime.
--
-- `grant usage on schema extensions` is added so the API roles can still reach
-- the extensions if anything ever does call them by name.
-- ===========================================================================

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter extension pg_trgm  set schema extensions;
alter extension unaccent set schema extensions;
