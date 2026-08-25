-- ===========================================================================
-- 0014_fix_customer_column_guard.sql
--
-- Corrects the guard added in 0013. protect_customer_columns() was created
-- SECURITY DEFINER, which meant `current_user` inside it evaluated to the
-- function owner rather than the caller, so the "is this coming straight from
-- the API?" test never matched and the guard silently passed everything
-- through. A signed-in customer could still set their own loyalty_points.
--
-- Invoker rights are what this function actually needs:
--   * called through PostgREST  -> current_user is 'authenticated' / 'anon'
--   * called from an internal SECURITY DEFINER rollup (refresh_customer_totals,
--     loyalty triggers) -> current_user is the function owner, so those keep
--     working untouched.
--
-- is_staff() stays SECURITY DEFINER, so the staff check still resolves.
-- ===========================================================================

create or replace function public.protect_customer_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.is_staff() then
    return new;
  end if;

  new.loyalty_points := old.loyalty_points;
  new.total_spent    := old.total_spent;
  new.orders_count   := old.orders_count;
  new.last_order_at  := old.last_order_at;
  new.is_blocked     := old.is_blocked;
  new.user_id        := old.user_id;
  new.tags           := old.tags;
  new.notes          := old.notes;

  return new;
end;
$$;

drop trigger if exists customers_protect_columns on public.customers;
create trigger customers_protect_columns
  before update on public.customers
  for each row execute function public.protect_customer_columns();
