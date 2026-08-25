-- ===========================================================================
-- 0027_review_purchase_requirement.sql
--
-- A review now requires a completed purchase of that product by the reviewer.
-- `reviews.product_id` was verified to exist before applying, and referencing
-- it from WITH CHECK works, so no BEFORE INSERT trigger was needed.
--
-- Staff keep their existing full-write policy, so seeding reviews as staff
-- still works.
-- ===========================================================================

drop policy if exists reviews_own_insert on public.reviews;
create policy reviews_own_insert on public.reviews
  for insert with check (
    user_id = auth.uid()
    and status = 'pending'::public.review_status
    and exists (
      select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.customer_id = public.my_customer_id()
        and o.status = 'completed'
        and oi.product_id = reviews.product_id
    )
  );
