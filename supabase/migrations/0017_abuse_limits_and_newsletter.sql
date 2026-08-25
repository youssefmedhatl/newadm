-- ===========================================================================
-- 0017_abuse_limits_and_newsletter.sql
--
-- Security review 2026-07-29, phase 3, plus one loose end from 0016.
--
-- SEC-03b  v_variant_stock exposes COALESCE(v.cost_price, p.cost_price) and was
--          readable by anon. After 0016 it fails with a confusing "permission
--          denied for table product_variants" instead of a clean denial. No
--          application code reads this view; it is staff/BI only.
-- SEC-10   Denial of inventory — create_online_order is callable anonymously
--          and reserves stock, with nothing capping how many unpaid orders one
--          caller may stack up.
-- SEC-11   newsletter_insert was WITH CHECK (true): unlimited anonymous rows,
--          no validation, no uniqueness.
--
-- Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- SEC-03b — staff-only, stated explicitly.
-- ---------------------------------------------------------------------------
revoke all on public.v_variant_stock from anon;

-- ---------------------------------------------------------------------------
-- SEC-10 — cap concurrent unpaid online orders per phone number.
--
-- Deliberately generous: a real shopper placing a second or third order before
-- the first is delivered is normal, so the limit sits well above that. It
-- bounds how much stock one phone number can hold hostage in `reserved`.
--
-- This is a trigger rather than a change to create_online_order so it applies
-- to every path that could ever insert an online order.
--
-- Honest limitation: an attacker who rotates phone numbers is not stopped by
-- this. Phone verification (OTP) at checkout is the real control; this removes
-- the trivial single-caller version of the attack.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_online_order_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_orders int;
  max_open    int;
begin
  if new.channel <> 'online' then
    return new;
  end if;

  -- Staff taking an order on a customer's behalf are trusted.
  if public.is_staff() then
    return new;
  end if;

  max_open := coalesce(
    (public.get_setting('security', '{"max_open_guest_orders": 5}'::jsonb)
      ->>'max_open_guest_orders')::int, 5);

  select count(*) into open_orders
  from public.orders
  where contact_phone = new.contact_phone
    and channel = 'online'
    and status = 'pending'
    and payment_status = 'unpaid';

  if open_orders >= max_open then
    raise exception
      'There are already % unpaid orders for this phone number. Please complete or cancel one before placing another.',
      open_orders;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_enforce_online_limits on public.orders;
create trigger orders_enforce_online_limits
  before insert on public.orders
  for each row execute function public.enforce_online_order_limits();

insert into public.settings (key, value, is_public, description)
values ('security', '{"max_open_guest_orders": 5}'::jsonb, false,
        'Abuse limits for anonymous storefront actions')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- SEC-11 — newsletter signups must at least look like an email and must not
-- be duplicated. Normalised on the way in so casing cannot bypass uniqueness.
-- ---------------------------------------------------------------------------
create or replace function public.normalise_newsletter_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := lower(btrim(new.email));

  if new.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$' then
    raise exception 'That email address does not look valid';
  end if;

  return new;
end;
$$;

drop trigger if exists newsletter_normalise_email on public.newsletter_subscribers;
create trigger newsletter_normalise_email
  before insert or update on public.newsletter_subscribers
  for each row execute function public.normalise_newsletter_email();

-- Collapse any existing duplicates before enforcing uniqueness.
do $$
begin
  update public.newsletter_subscribers set email = lower(btrim(email));

  delete from public.newsletter_subscribers a
  using public.newsletter_subscribers b
  where a.email = b.email and a.ctid > b.ctid;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'newsletter_subscribers_email_uniq'
  ) then
    execute 'create unique index newsletter_subscribers_email_uniq
               on public.newsletter_subscribers (email)';
  end if;
end $$;

-- Replace the always-true insert policy. Shape and uniqueness are enforced
-- above; the policy now also refuses a blank address outright.
drop policy if exists newsletter_insert on public.newsletter_subscribers;
create policy newsletter_insert on public.newsletter_subscribers
  for insert
  with check (email is not null and btrim(email) <> '');
