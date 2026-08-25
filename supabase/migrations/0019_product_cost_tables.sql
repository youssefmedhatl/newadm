-- ===========================================================================
-- 0019_product_cost_tables.sql
--
-- products.cost_price and product_variants.cost_price were readable by any
-- signed-in user, because staff and customers share the `authenticated` role
-- and RLS cannot restrict columns. Cost moves into its own tables with their
-- own access rules.
--
-- The old columns are NOT dropped here — that is deferred until the cost
-- separation has been reviewed (see PENDING_0031_drop_cost_columns.sql.txt).
-- ===========================================================================

create table if not exists public.product_costs (
  product_id  uuid primary key references public.products(id) on delete cascade,
  cost_price  numeric(12,2) not null default 0,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

create table if not exists public.variant_costs (
  variant_id  uuid primary key references public.product_variants(id) on delete cascade,
  cost_price  numeric(12,2),
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

-- copy existing data across
insert into public.product_costs (product_id, cost_price)
select id, coalesce(cost_price, 0) from public.products
on conflict (product_id) do nothing;

insert into public.variant_costs (variant_id, cost_price)
select id, cost_price from public.product_variants
on conflict (variant_id) do nothing;

-- staff only, no public access whatsoever
alter table public.product_costs enable row level security;
alter table public.variant_costs enable row level security;

drop policy if exists product_costs_staff on public.product_costs;
drop policy if exists variant_costs_staff on public.variant_costs;

create policy product_costs_staff on public.product_costs
  for all using (public.is_staff()) with check (public.is_staff());
create policy variant_costs_staff on public.variant_costs
  for all using (public.is_staff()) with check (public.is_staff());

revoke all on public.product_costs from anon;
revoke all on public.variant_costs from anon;
grant select, insert, update, delete on public.product_costs to authenticated;
grant select, insert, update, delete on public.variant_costs to authenticated;

-- keep them in step when a product or variant is created
create or replace function public.ensure_cost_rows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'products' then
    insert into public.product_costs (product_id) values (new.id)
      on conflict (product_id) do nothing;
  else
    insert into public.variant_costs (variant_id) values (new.id)
      on conflict (variant_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists products_ensure_cost on public.products;
create trigger products_ensure_cost after insert on public.products
  for each row execute function public.ensure_cost_rows();

drop trigger if exists variants_ensure_cost on public.product_variants;
create trigger variants_ensure_cost after insert on public.product_variants
  for each row execute function public.ensure_cost_rows();
