# P12 — Storefront: cart, checkout, tracking, account

Read `docs/REMAINING_WORK.md`, `docs/BUILD_SPEC.md` and P11 first.

**Files you own:** `src/storefront/*` (cart, checkout, account pages), the
related routes in `src/App.tsx`, and `src/lib/translations.ts` (Edit only).

This is the package where a customer actually gives you money, so correctness
matters more than polish.

---

## A. Cart

`src/storefront/useCart.ts` (create in P11 if not already there) — persisted to
`localStorage['vitality.shop.cart']`. A line is
`{ variant_id, quantity }` plus cached display fields (name, size, colour,
price, image/hex).

- **`variant_id` is the only thing that identifies a purchasable item.** Never
  key a cart line by product id.
- On load, re-validate against live stock: drop lines whose variant is gone or
  now has 0 available, cap quantities at what remains, and show one toast if
  anything changed. Stock moves while a cart sits in localStorage.
- Cart drawer (slide-over) and a full `/cart` page: line items, quantity
  steppers capped at available, remove, subtotal via `formatMoney`, and a
  free-shipping progress hint driven by the `shipping` setting
  (`rpc('get_setting', { p_key: 'shipping' })` → `flat_fee`, `free_over`).
- Empty state linking back to the shop.

## B. Checkout — `/checkout`

**Cash only.** There is no card form, no payment provider, and none may be
added. Two fulfilment choices:
- **Delivery** → `payment_method` becomes `cash_on_delivery` (courier collects)
- **Pickup** → `payment_method` becomes `cash` (paid in store)

The database sets that automatically from `p_fulfillment`; you just pass the
choice.

Single page, clearly sectioned:
1. **Contact** — name (required), phone (required), email (optional).
   Prefill from the signed-in customer when available.
2. **Fulfilment** — delivery or pickup. For pickup, let them choose a branch
   from `locations` where `is_active`.
3. **Address** (delivery only, required) — line1, line2, city, governorate,
   landmark. Signed-in customers pick a saved `customer_addresses` row or add a
   new one.
4. **Discount code** — validated live via
   `rpc('validate_discount', { p_code, p_subtotal })`. Show the amount when
   valid, the returned `reason` when not.
5. **Summary** — subtotal, discount, shipping, total.
   Shipping: `flat_fee` from settings, zero when
   `subtotal - discount >= free_over`. Say so explicitly in the UI.
6. **Notes** — optional.

Place the order with exactly one call:
```ts
const { data, error } = await supabase.rpc('create_online_order', {
  p_items: items.map(i => ({ variant_id: i.variant_id, quantity: i.quantity })),
  p_contact_name, p_contact_phone,
  p_fulfillment,            // 'delivery' | 'pickup'
  p_contact_email,          // nullable
  p_address,                // object, required when delivery
  p_discount_code,          // nullable
  p_notes,                  // nullable
  p_location_id,            // nullable — the DB picks a branch when omitted
})
```

> **Never send prices.** The function reads every price from the database and
> ignores anything the browser claims. Do not try to pass totals.

Handle failure properly. The database returns readable sentences and you must
show them verbatim — for example *"Only 2 left of Field jacket (M / Black)"* or
*"This account cannot place orders. Please contact the store."* On a stock
failure, refresh the cart against live stock so the customer can see what
changed. **Disable the Place Order button while the request is in flight** so a
double-click cannot create two orders.

On success: clear the cart and go to the confirmation page.

## C. Confirmation — `/order/:orderNumber`

Order number prominently (`dir="ltr"`), items, totals, fulfilment method, and
what happens next. Make the cash expectation explicit: *"Please have EGP X ready
for the courier"* or *"Pay when you collect from <branch>"*. Print button.

## D. Order tracking — `/track`

Guests have no account, so let them look an order up by **order number + phone**.
Both must match. RLS only exposes orders to staff or to the matching customer,
so a guest lookup needs care:
- If the visitor is signed in and the order belongs to their customer record,
  a normal query works.
- Otherwise the safest approach within the current schema is to require
  sign-in for full detail, and show only a minimal status for a guest lookup.
  **Do not invent a new database function or loosen RLS to make this easier** —
  if you cannot do it safely with what exists, say so in your report and
  implement the signed-in path only.

Show the status timeline from `order_events` (visible to the owning customer),
and translate each status into plain language.

## E. Account — `/account`, requires sign-in

Supabase email/password auth, same client as the admin but WITHOUT
`RequireStaff` — customers have `profiles.role = 'customer'` and must never be
sent to `/admin`.

- **Orders** — their `orders` newest first (RLS scopes this automatically),
  each linking to the confirmation view.
- **Profile** — name, phone, email on their `customers` row. A customer may
  update their own row; RLS forbids changing `is_blocked`.
- **Addresses** — CRUD on `customer_addresses`, with a default flag (a trigger
  keeps only one default per customer).
- **Loyalty** — balance from `customers.loyalty_points` and the ledger from
  `loyalty_transactions`. Explain the rule from the `loyalty` setting: 1 point
  per EGP, and what points are worth.
- **Wishlist** — `wishlist_items` keyed by `user_id`, with move-to-bag.

Sign-in / sign-up pages for customers. After sign-up, `handle_new_user()`
creates their profile as `customer` automatically — do not insert into
`profiles` yourself. Their `customers` row is created on first order by
`create_online_order`, matched on phone; a signed-in customer's `user_id` gets
attached then.

---

## Gate

Every gate command in `REMAINING_WORK.md`, plus a real end-to-end test:
1. `npm run dev`, add a product to the bag, and complete checkout as a guest.
2. Confirm the order appears in the admin under `/admin/orders`.
3. Confirm the stock behaved correctly: an online order **reserves** stock, so
   `inventory_levels.reserved` should rise while `quantity` stays unchanged.
   Sellable stock on the storefront should drop by the ordered amount.
4. Report the actual order number created and the before/after stock numbers.

If step 3 shows `quantity` dropping instead of `reserved` rising, something is
wrong — say so rather than reporting success.
