-- ===========================================================================
-- 0002_catalog.sql — locations, categories, brands, products, variants,
--                    images, collections
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Locations (branches / warehouses). Everything stock-related hangs off these.
-- ---------------------------------------------------------------------------
create table if not exists public.locations (
  id           uuid primary key default gen_random_uuid(),
  name_en      text not null,
  name_ar      text not null,
  code         text unique,
  address      text,
  city         text,
  phone        text,
  is_warehouse boolean not null default false,
  sells_online boolean not null default true,   -- can fulfil online orders
  is_active    boolean not null default true,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at before update on public.locations
  for each row execute function public.set_updated_at();

-- profiles.location_id was declared in 0001 without its FK; wire it up now.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_location_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_location_id_fkey
      foreign key (location_id) references public.locations(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Categories (self-nesting, e.g. Men > Tops > T-shirts)
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id) on delete set null,
  slug        text not null unique,
  name_en     text not null,
  name_ar     text not null,
  description_en text,
  description_ar text,
  image_url   text,
  position    int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists categories_parent_idx on public.categories(parent_id);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  logo_url   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name_en         text not null,
  name_ar         text not null,
  description_en  text,
  description_ar  text,
  category_id     uuid references public.categories(id) on delete set null,
  brand_id        uuid references public.brands(id) on delete set null,
  status          public.product_status not null default 'draft',

  -- Money. Variants may override `price`; `cost_price` drives profit reports.
  price           numeric(12,2) not null default 0 check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  cost_price      numeric(12,2) not null default 0 check (cost_price >= 0),

  is_featured     boolean not null default false,
  is_new          boolean not null default false,
  tags            text[] not null default '{}',
  material_en     text,
  material_ar     text,
  care_en         text,
  care_ar         text,
  seo_title       text,
  seo_description text,

  -- denormalised roll-ups, kept fresh by triggers in 0008
  rating_avg      numeric(3,2) not null default 0,
  rating_count    int not null default 0,
  total_sold      int not null default 0,

  published_at    timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists products_status_idx    on public.products(status);
create index if not exists products_category_idx  on public.products(category_id);
create index if not exists products_featured_idx  on public.products(is_featured) where is_featured;
create index if not exists products_search_en_idx on public.products using gin (name_en gin_trgm_ops);
create index if not exists products_search_ar_idx on public.products using gin (name_ar gin_trgm_ops);
create index if not exists products_tags_idx      on public.products using gin (tags);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Product images
-- ---------------------------------------------------------------------------
create table if not exists public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url        text not null,
  alt        text,
  color_name text,          -- lets the gallery swap when a colour is picked
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_idx on public.product_images(product_id, position);

-- ---------------------------------------------------------------------------
-- Variants — a clothing store is size x colour, so those are first-class.
-- ---------------------------------------------------------------------------
create table if not exists public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  sku         text not null unique,
  barcode     text unique,
  size        text,                       -- S / M / L / XL / 42 ...
  color_name  text,
  color_hex   text,
  price       numeric(12,2) check (price is null or price >= 0),  -- null = inherit product.price
  cost_price  numeric(12,2) check (cost_price is null or cost_price >= 0),
  weight_grams int,
  position    int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, size, color_name)
);

create index if not exists variants_product_idx on public.product_variants(product_id);
create index if not exists variants_barcode_idx on public.product_variants(barcode);

drop trigger if exists variants_set_updated_at on public.product_variants;
create trigger variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- Effective selling price of a variant (variant override, else product price).
create or replace function public.variant_price(v public.product_variants)
returns numeric
language sql
stable
as $$
  select coalesce(v.price, (select p.price from public.products p where p.id = v.product_id));
$$;

-- ---------------------------------------------------------------------------
-- Collections — curated groups the storefront can render ("New drop", "Sale")
-- ---------------------------------------------------------------------------
create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title_en    text not null,
  title_ar    text not null,
  subtitle_en text,
  subtitle_ar text,
  image_url   text,
  is_active   boolean not null default true,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.collection_products (
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  position      int not null default 0,
  primary key (collection_id, product_id)
);

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();
