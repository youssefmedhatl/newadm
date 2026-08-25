-- ===========================================================================
-- 0004_customers.sql — customers, addresses, loyalty, wishlist, reviews,
--                      newsletter
-- ===========================================================================

create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete set null, -- set when they register online
  full_name     text not null,
  phone         text,
  email         text,
  city          text,
  notes         text,
  tags          text[] not null default '{}',
  birthday      date,

  -- roll-ups maintained by trigger (see 0008)
  loyalty_points int not null default 0 check (loyalty_points >= 0),
  orders_count   int not null default 0,
  total_spent    numeric(12,2) not null default 0,
  last_order_at  timestamptz,

  is_blocked    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Phone is the natural key for a walk-in shop, but it's optional.
create unique index if not exists customers_phone_key
  on public.customers(phone) where phone is not null and phone <> '';
create index if not exists customers_name_idx
  on public.customers using gin (full_name gin_trgm_ops);
create index if not exists customers_spent_idx on public.customers(total_spent desc);

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
create table if not exists public.customer_addresses (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label       text,                     -- "Home", "Work"
  full_name   text,
  phone       text,
  line1       text not null,
  line2       text,
  city        text not null,
  governorate text,
  landmark    text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists addresses_customer_idx on public.customer_addresses(customer_id);

drop trigger if exists addresses_set_updated_at on public.customer_addresses;
create trigger addresses_set_updated_at before update on public.customer_addresses
  for each row execute function public.set_updated_at();

-- Only one default address per customer.
create or replace function public.enforce_single_default_address()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.customer_addresses
      set is_default = false
      where customer_id = new.customer_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists addresses_single_default on public.customer_addresses;
create trigger addresses_single_default
  after insert or update of is_default on public.customer_addresses
  for each row when (new.is_default) execute function public.enforce_single_default_address();

-- ---------------------------------------------------------------------------
-- Loyalty ledger. customers.loyalty_points is the running balance.
-- ---------------------------------------------------------------------------
create table if not exists public.loyalty_transactions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  points      int not null check (points <> 0),   -- + earned / - redeemed
  reason      text not null,                      -- 'order' | 'redemption' | 'manual' | 'signup'
  order_id    uuid,                               -- FK added in 0005
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists loyalty_customer_idx on public.loyalty_transactions(customer_id, created_at desc);

create or replace function public.apply_loyalty_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customers
    set loyalty_points = greatest(loyalty_points + new.points, 0)
    where id = new.customer_id;
  return new;
end;
$$;

drop trigger if exists loyalty_applied on public.loyalty_transactions;
create trigger loyalty_applied
  after insert on public.loyalty_transactions
  for each row execute function public.apply_loyalty_transaction();

-- ---------------------------------------------------------------------------
-- Wishlist (storefront)
-- ---------------------------------------------------------------------------
create table if not exists public.wishlist_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Reviews (moderated from the admin)
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  author_name text not null,
  rating      int not null check (rating between 1 and 5),
  title       text,
  body        text,
  status      public.review_status not null default 'pending',
  replied_at  timestamptz,
  reply       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists reviews_product_idx on public.reviews(product_id, status);

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

-- Keep products.rating_avg / rating_count in sync with approved reviews.
create or replace function public.refresh_product_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p
    set rating_avg = coalesce((
          select round(avg(r.rating)::numeric, 2)
          from public.reviews r
          where r.product_id = pid and r.status = 'approved'
        ), 0),
        rating_count = (
          select count(*)
          from public.reviews r
          where r.product_id = pid and r.status = 'approved'
        )
    where p.id = pid;
  return null;
end;
$$;

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_product_rating();

-- ---------------------------------------------------------------------------
-- Newsletter
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  is_subscribed boolean not null default true,
  source        text default 'storefront',
  created_at    timestamptz not null default now()
);
