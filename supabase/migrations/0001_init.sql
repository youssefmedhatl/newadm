-- ===========================================================================
-- 0001_init.sql — extensions, enums, shared helpers
-- Vitality clothing store. Cash-only (no card/payment processor integration).
-- Safe to re-run.
-- ===========================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- fuzzy product search
create extension if not exists "unaccent";      -- accent-insensitive search

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('owner','manager','cashier','stock','viewer','customer');
  end if;

  if not exists (select 1 from pg_type where typname = 'product_status') then
    create type public.product_status as enum ('draft','active','archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_channel') then
    create type public.order_channel as enum ('pos','online');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum
      ('pending','confirmed','preparing','ready','out_for_delivery','completed','cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'fulfillment_type') then
    create type public.fulfillment_type as enum ('pickup','delivery','in_store');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('unpaid','paid','partially_refunded','refunded');
  end if;

  -- Cash only, by design. 'cash' = paid at the counter, 'cash_on_delivery' =
  -- collected by the courier when the order is handed over.
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('cash','cash_on_delivery');
  end if;

  if not exists (select 1 from pg_type where typname = 'movement_reason') then
    create type public.movement_reason as enum
      ('initial','sale','return','purchase','adjustment','transfer_in','transfer_out','damage','stocktake','cancellation');
  end if;

  if not exists (select 1 from pg_type where typname = 'discount_type') then
    create type public.discount_type as enum ('percentage','fixed');
  end if;

  if not exists (select 1 from pg_type where typname = 'shift_status') then
    create type public.shift_status as enum ('open','closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'cash_movement_type') then
    create type public.cash_movement_type as enum
      ('opening_float','sale','refund','pay_in','pay_out','expense','closing');
  end if;

  if not exists (select 1 from pg_type where typname = 'po_status') then
    create type public.po_status as enum ('draft','ordered','partially_received','received','cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'transfer_status') then
    create type public.transfer_status as enum ('draft','in_transit','received','cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'return_status') then
    create type public.return_status as enum ('pending','approved','rejected','completed');
  end if;

  if not exists (select 1 from pg_type where typname = 'review_status') then
    create type public.review_status as enum ('pending','approved','rejected');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff profiles (extends auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  phone         text,
  avatar_url    text,
  role          public.app_role not null default 'customer',
  location_id   uuid,                       -- FK added in 0002 once locations exists
  is_active     boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever someone signs up.
-- The very first account to ever sign up becomes the 'owner'; everyone else
-- starts as 'customer' and must be promoted from the Staff screen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_count int;
  assigned    public.app_role;
begin
  select count(*) into staff_count from public.profiles where role <> 'customer';

  if staff_count = 0 then
    assigned := 'owner';
  else
    assigned := 'customer';
  end if;

  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    assigned
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helpers.
-- SECURITY DEFINER so RLS policies can call them without recursing into the
-- policies on `profiles` itself.
-- ---------------------------------------------------------------------------
-- NB: not named `current_role` — that is a reserved keyword in Postgres.
create or replace function public.auth_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid() and p.is_active),
    'customer'::public.app_role
  );
$$;

create or replace function public.has_role(allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_role() = any(allowed);
$$;

-- Any signed-in staff member (i.e. not a plain customer).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_role() <> 'customer'::public.app_role;
$$;

-- Can change money, prices, settings, staff.
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_role() in ('owner','manager');
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_role() = 'owner';
$$;

grant execute on function public.auth_role() to authenticated, anon;
grant execute on function public.has_role(public.app_role[]) to authenticated, anon;
grant execute on function public.is_staff() to authenticated, anon;
grant execute on function public.is_manager() to authenticated, anon;
grant execute on function public.is_owner() to authenticated, anon;
