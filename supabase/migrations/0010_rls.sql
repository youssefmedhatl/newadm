-- ===========================================================================
-- 0010_rls.sql — Row Level Security
--
-- Shape of the rules:
--   * anon / customers  -> can read the published catalogue, and only their
--                          own customer record, orders, addresses, wishlist.
--   * staff (any role)  -> can read and run the shop.
--   * manager / owner   -> prices, discounts, settings, staff, destructive ops.
--
-- The anon key is safe to ship in the browser precisely because of this file.
-- ===========================================================================

-- Which customer row (if any) belongs to the signed-in user.
-- SECURITY DEFINER so policies don't recurse through customers' own policy.
create or replace function public.my_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.customers where user_id = auth.uid() limit 1;
$$;

grant execute on function public.my_customer_id() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Turn RLS on everywhere. Nothing is readable until a policy says so.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','locations','categories','brands','products','product_images',
    'product_variants','collections','collection_products','inventory_levels',
    'inventory_movements','suppliers','purchase_orders','purchase_order_items',
    'stock_transfers','stock_transfer_items','customers','customer_addresses',
    'loyalty_transactions','wishlist_items','reviews','newsletter_subscribers',
    'discounts','orders','order_items','order_events','returns','return_items',
    'shifts','cash_movements','expenses','settings','content_blocks',
    'marquee_messages','notifications','audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- NB: deliberately NOT `force row level security`. The SECURITY DEFINER
    -- functions in 0008 are owned by `postgres`; forcing RLS would subject them
    -- to these same policies and break guest checkout (create_online_order runs
    -- as postgres but with the guest's auth.uid(), so is_staff() is false).
  end loop;
end $$;

-- Base grants. RLS is what actually gates access; without these the roles
-- can't even attempt a query.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ===========================================================================
-- Catalogue — world-readable when published, staff-writable
-- ===========================================================================
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select using (status = 'active' or public.is_staff());

drop policy if exists products_staff_write on public.products;
create policy products_staff_write on public.products
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists variants_public_read on public.product_variants;
create policy variants_public_read on public.product_variants
  for select using (
    public.is_staff() or exists (
      select 1 from public.products p
      where p.id = product_id and p.status = 'active'
    )
  );

drop policy if exists variants_staff_write on public.product_variants;
create policy variants_staff_write on public.product_variants
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists images_public_read on public.product_images;
create policy images_public_read on public.product_images
  for select using (true);
drop policy if exists images_staff_write on public.product_images;
create policy images_staff_write on public.product_images
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select using (is_active or public.is_staff());
drop policy if exists categories_staff_write on public.categories;
create policy categories_staff_write on public.categories
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists brands_public_read on public.brands;
create policy brands_public_read on public.brands for select using (true);
drop policy if exists brands_staff_write on public.brands;
create policy brands_staff_write on public.brands
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists collections_public_read on public.collections;
create policy collections_public_read on public.collections
  for select using (is_active or public.is_staff());
drop policy if exists collections_staff_write on public.collections;
create policy collections_staff_write on public.collections
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists collection_products_public_read on public.collection_products;
create policy collection_products_public_read on public.collection_products
  for select using (true);
drop policy if exists collection_products_staff_write on public.collection_products;
create policy collection_products_staff_write on public.collection_products
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists locations_public_read on public.locations;
create policy locations_public_read on public.locations
  for select using (is_active or public.is_staff());
drop policy if exists locations_manager_write on public.locations;
create policy locations_manager_write on public.locations
  for all using (public.is_manager()) with check (public.is_manager());

-- ===========================================================================
-- Stock — readable by anyone (so the shop can show "only 2 left"),
-- writable only through the SECURITY DEFINER functions / by staff.
-- ===========================================================================
drop policy if exists inv_levels_read on public.inventory_levels;
create policy inv_levels_read on public.inventory_levels for select using (true);
drop policy if exists inv_levels_staff_write on public.inventory_levels;
create policy inv_levels_staff_write on public.inventory_levels
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists inv_moves_staff on public.inventory_movements;
create policy inv_moves_staff on public.inventory_movements
  for all using (public.is_staff()) with check (public.is_staff());

-- ===========================================================================
-- Purchasing & transfers — staff only
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','purchase_orders','purchase_order_items',
    'stock_transfers','stock_transfer_items'
  ]
  loop
    execute format('drop policy if exists %I_staff on public.%I', t, t);
    execute format(
      'create policy %I_staff on public.%I for all using (public.is_staff()) with check (public.is_staff())',
      t, t
    );
  end loop;
end $$;

-- ===========================================================================
-- Customers — a customer sees only themselves; staff see everyone
-- ===========================================================================
drop policy if exists customers_self_read on public.customers;
create policy customers_self_read on public.customers
  for select using (public.is_staff() or user_id = auth.uid());

drop policy if exists customers_self_update on public.customers;
create policy customers_self_update on public.customers
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_blocked = false);

drop policy if exists customers_staff_write on public.customers;
create policy customers_staff_write on public.customers
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists addresses_owner on public.customer_addresses;
create policy addresses_owner on public.customer_addresses
  for all using (public.is_staff() or customer_id = public.my_customer_id())
  with check (public.is_staff() or customer_id = public.my_customer_id());

drop policy if exists loyalty_read on public.loyalty_transactions;
create policy loyalty_read on public.loyalty_transactions
  for select using (public.is_staff() or customer_id = public.my_customer_id());
drop policy if exists loyalty_staff_write on public.loyalty_transactions;
create policy loyalty_staff_write on public.loyalty_transactions
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists wishlist_owner on public.wishlist_items;
create policy wishlist_owner on public.wishlist_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===========================================================================
-- Reviews — approved ones are public; you can write your own; staff moderate
-- ===========================================================================
drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read on public.reviews
  for select using (status = 'approved' or public.is_staff() or user_id = auth.uid());

drop policy if exists reviews_own_insert on public.reviews;
create policy reviews_own_insert on public.reviews
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists reviews_staff_write on public.reviews;
create policy reviews_staff_write on public.reviews
  for all using (public.is_staff()) with check (public.is_staff());

-- Newsletter: anyone may subscribe, only staff may read the list.
drop policy if exists newsletter_insert on public.newsletter_subscribers;
create policy newsletter_insert on public.newsletter_subscribers
  for insert to anon, authenticated with check (true);
drop policy if exists newsletter_staff_read on public.newsletter_subscribers;
create policy newsletter_staff_read on public.newsletter_subscribers
  for select using (public.is_staff());
drop policy if exists newsletter_staff_write on public.newsletter_subscribers;
create policy newsletter_staff_write on public.newsletter_subscribers
  for all using (public.is_staff()) with check (public.is_staff());

-- ===========================================================================
-- Discounts — the code itself is validated server-side, so customers never
-- need to read this table. Staff read; managers write.
-- ===========================================================================
drop policy if exists discounts_staff_read on public.discounts;
create policy discounts_staff_read on public.discounts
  for select using (public.is_staff());
drop policy if exists discounts_manager_write on public.discounts;
create policy discounts_manager_write on public.discounts
  for all using (public.is_manager()) with check (public.is_manager());

-- ===========================================================================
-- Orders — customers read their own; staff read all. Writes go through RPCs.
-- ===========================================================================
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders
  for select using (
    public.is_staff() or customer_id = public.my_customer_id()
  );
drop policy if exists orders_staff_write on public.orders;
create policy orders_staff_write on public.orders
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items
  for select using (
    public.is_staff() or exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = public.my_customer_id()
    )
  );
drop policy if exists order_items_staff_write on public.order_items;
create policy order_items_staff_write on public.order_items
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists order_events_read on public.order_events;
create policy order_events_read on public.order_events
  for select using (
    public.is_staff() or exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = public.my_customer_id()
    )
  );
drop policy if exists order_events_staff_write on public.order_events;
create policy order_events_staff_write on public.order_events
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists returns_staff on public.returns;
create policy returns_staff on public.returns
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists return_items_staff on public.return_items;
create policy return_items_staff on public.return_items
  for all using (public.is_staff()) with check (public.is_staff());

-- ===========================================================================
-- Cash — staff can see and operate the drawer; only managers can delete.
-- ===========================================================================
drop policy if exists shifts_staff on public.shifts;
create policy shifts_staff on public.shifts
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists cash_moves_staff on public.cash_movements;
create policy cash_moves_staff on public.cash_movements
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists expenses_staff_read on public.expenses;
create policy expenses_staff_read on public.expenses
  for select using (public.is_staff());
drop policy if exists expenses_staff_insert on public.expenses;
create policy expenses_staff_insert on public.expenses
  for insert with check (public.is_staff());
drop policy if exists expenses_manager_modify on public.expenses;
create policy expenses_manager_modify on public.expenses
  for update using (public.is_manager()) with check (public.is_manager());
drop policy if exists expenses_manager_delete on public.expenses;
create policy expenses_manager_delete on public.expenses
  for delete using (public.is_manager());

-- ===========================================================================
-- Settings & CMS — public entries are world-readable, managers write
-- ===========================================================================
drop policy if exists settings_public_read on public.settings;
create policy settings_public_read on public.settings
  for select using (is_public or public.is_staff());
drop policy if exists settings_manager_write on public.settings;
create policy settings_manager_write on public.settings
  for all using (public.is_manager()) with check (public.is_manager());

drop policy if exists content_public_read on public.content_blocks;
create policy content_public_read on public.content_blocks
  for select using (is_active or public.is_staff());
drop policy if exists content_staff_write on public.content_blocks;
create policy content_staff_write on public.content_blocks
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists marquee_public_read on public.marquee_messages;
create policy marquee_public_read on public.marquee_messages
  for select using (is_active or public.is_staff());
drop policy if exists marquee_staff_write on public.marquee_messages;
create policy marquee_staff_write on public.marquee_messages
  for all using (public.is_staff()) with check (public.is_staff());

-- ===========================================================================
-- Profiles, notifications, audit
-- ===========================================================================
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  -- A user may edit their own name/phone/avatar but must not promote
  -- themselves. auth_role() reads the *stored* role via SECURITY DEFINER, so
  -- comparing against it blocks any attempt to write a different one.
  with check (
    id = auth.uid()
    and role = public.auth_role()
    and is_active = true
  );

drop policy if exists profiles_owner_write on public.profiles;
create policy profiles_owner_write on public.profiles
  for all using (public.is_manager()) with check (public.is_manager());

drop policy if exists notifications_staff on public.notifications;
create policy notifications_staff on public.notifications
  for all using (public.is_staff()) with check (public.is_staff());

-- Audit log is append-only from the app's point of view: read by managers,
-- written only by the SECURITY DEFINER trigger. No insert/update/delete policy
-- exists, so nobody can forge or erase an entry through the API.
drop policy if exists audit_manager_read on public.audit_log;
create policy audit_manager_read on public.audit_log
  for select using (public.is_manager());

-- ===========================================================================
-- Storage bucket for product images
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images are public" on storage.objects;
create policy "product images are public" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "staff upload product images" on storage.objects;
create policy "staff upload product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_staff());

drop policy if exists "staff update product images" on storage.objects;
create policy "staff update product images" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_staff());

drop policy if exists "staff delete product images" on storage.objects;
create policy "staff delete product images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_staff());
