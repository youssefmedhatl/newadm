-- ===========================================================================
-- 0012_harden_function_grants.sql
--
-- Postgres grants EXECUTE to PUBLIC on every newly created function. Combined
-- with SECURITY DEFINER that is a privilege escalation: helpers such as
-- consume_reservation() and award_loyalty_points() have no internal auth check
-- because they were only ever meant to be called by triggers or by other
-- SECURITY DEFINER functions. Left as-is, an anonymous visitor could call
-- consume_reservation('<any order id>') and drain stock.
--
-- Fix: revoke everything in `public`, then hand back exactly what each role
-- legitimately needs.
-- ===========================================================================

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('revoke all on function %s from authenticated', f.sig);
  end loop;
end $$;

-- Role predicates. RLS policies invoke these as the querying role, so both
-- anon and authenticated must hold EXECUTE or every policy fails closed.
grant execute on function public.auth_role()                    to anon, authenticated;
grant execute on function public.has_role(public.app_role[])    to anon, authenticated;
grant execute on function public.is_staff()                     to anon, authenticated;
grant execute on function public.is_manager()                   to anon, authenticated;
grant execute on function public.is_owner()                     to anon, authenticated;
grant execute on function public.my_customer_id()               to anon, authenticated;

-- Storefront: guest checkout, discount codes, public settings.
grant execute on function public.get_setting(text, jsonb)                to anon, authenticated;
grant execute on function public.validate_discount(text, numeric, uuid)  to anon, authenticated;
grant execute on function public.create_online_order(jsonb, text, text, public.fulfillment_type, text, jsonb, text, text, uuid) to anon, authenticated;

-- Pure helpers referenced from views.
grant execute on function public.available_qty(public.inventory_levels)  to anon, authenticated;
grant execute on function public.variant_price(public.product_variants)  to anon, authenticated;

-- Staff operations. Every one of these re-checks is_staff() internally.
grant execute on function public.create_pos_sale(uuid, jsonb, uuid, uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.complete_order(uuid, uuid)              to authenticated;
grant execute on function public.cancel_order(uuid, text)                to authenticated;
grant execute on function public.process_return(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.redeem_points(uuid, int)                to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, int, public.movement_reason, text) to authenticated;
grant execute on function public.set_stock(uuid, uuid, int, text)        to authenticated;
grant execute on function public.open_shift(uuid, numeric)               to authenticated;
grant execute on function public.close_shift(uuid, numeric, text)        to authenticated;
grant execute on function public.shift_expected_cash(uuid)               to authenticated;
grant execute on function public.record_cash_movement(uuid, public.cash_movement_type, numeric, text) to authenticated;
grant execute on function public.receive_purchase_order(uuid, jsonb)     to authenticated;
grant execute on function public.complete_stock_transfer(uuid)           to authenticated;

-- Intentionally granted to NOBODY: release_reservation, consume_reservation,
-- award_loyalty_points, next_order_number, and every trigger function.
-- Triggers do not consult the caller's EXECUTE privilege at fire time, and the
-- rest are only reached from inside other SECURITY DEFINER functions.
-- Verified after applying: a stock movement still updates inventory_levels.

-- Pin search_path on the functions that were still missing it.
alter function public.set_updated_at()                              set search_path = public;
alter function public.next_order_number()                           set search_path = public;
alter function public.variant_price(public.product_variants)        set search_path = public;
alter function public.available_qty(public.inventory_levels)        set search_path = public;
alter function public.enforce_single_default_address()              set search_path = public;
