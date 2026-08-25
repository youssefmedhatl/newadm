# P8 — Customers + Discounts + Staff

Read `docs/REMAINING_WORK.md` and `docs/BUILD_SPEC.md` first.

**Files you own:** `src/admin/pages/CustomersPage.tsx`,
`src/admin/pages/DiscountsPage.tsx`, `src/admin/pages/StaffPage.tsx`, a new
`src/admin/customers/` folder if useful, and `src/lib/translations.ts` (Edit only).

All three pages are currently `comingSoon` placeholders.

---

## A. Customers

Guard with `useCan()('customers')` — **below your hooks**.

**List** from `customers`: name, phone (`dir="ltr"`), city, `orders_count`,
`total_spent` (via `formatMoney`), `loyalty_points`, `last_order_at`, blocked
badge. Server-side pagination, 25 per page.

- `SearchInput` on full_name / phone / email. **Sanitise** before interpolating
  into a PostgREST `.or()` — strip `,()."\` and skip the filter if nothing
  survives.
- Filters: has orders / no orders, blocked. Sort by `total_spent` or
  `last_order_at` descending.

**Create / edit** in a Modal: `full_name` (required), phone, email, city,
birthday, tags (chips), notes.
`phone` has a UNIQUE partial index — catch Postgres error code `23505` and say
"a customer with this phone already exists" rather than surfacing a raw error.

**Detail** in a `Drawer`:
- Summary: lifetime spend, order count, average order value, loyalty balance,
  member since.
- Order history — their `orders` newest first, each linking to
  `/admin/orders/:id`.
- Loyalty ledger from `loyalty_transactions` (points, reason, date).
- Addresses from `customer_addresses`.
- **Adjust points**: amount + note, inserting into `loyalty_transactions` with a
  positive or negative `points` value. A trigger updates the balance — **never
  write `customers.loyalty_points` directly.**
- **Block / unblock** toggling `customers.is_blocked`. Blocked customers are
  refused at online checkout by the database.

---

## B. Discounts

Guard with `useCan()('discounts')` (owner/manager). The database also restricts
writes to managers.

**List**: code (`dir="ltr"`, uppercase), description, type `Badge`, value,
`min_subtotal`, `used_count / usage_limit`, validity window, active badge.
Visibly mark expired or exhausted codes.

**Create / edit** Modal covering every column: code, description, `type`
(`discount_type` enum), value, `min_subtotal`, `max_discount`, `usage_limit`,
`per_customer_limit`, `starts_at`, `ends_at`, `is_active`, and optional scoping
to a category or a single product.

Client-side validation mirroring the database CHECK constraints, explained in
plain language:
- `value > 0`
- when `type = 'percentage'`, `value <= 100`
- `ends_at` after `starts_at`
- code is unique — catch `23505`

> **Percentages are stored as whole numbers.** `discounts.value = 10` means 10%.
> Display with `formatPercent(v, locale, { isWholeNumber: true })` or it renders
> "1,000%". See `src/lib/money.ts`.

**Test helper**: a small panel calling
`rpc('validate_discount', { p_code, p_subtotal })` with a sample subtotal,
showing the computed amount or the rejection `reason`.

Inline active/inactive toggle. Deleting is allowed but warn that existing orders
keep the code as a snapshot.

---

## C. Staff

Guard with `useCan()('staff')` (owner/manager only).

**List** everyone in `profiles`: `full_name`, phone, role `Badge`, branch,
`is_active`, `last_seen_at`.

**Change role** — a `Select` over the `app_role` enum writing `profiles.role`,
with these guard rails:
- Only an `owner` may promote someone TO `owner`, or demote an existing owner.
  A manager must not see those options — check `useAuth().role`.
- Nobody may change their own role. Disable the control on your own row and say
  why.
- Count owners first; refuse to demote the last remaining one.

**Activate / deactivate** — toggle `profiles.is_active`. A deactivated staff
member is treated as having no access at all (the database's `auth_role()`
returns `customer` for them). Do not allow deactivating yourself.

**Default branch** via `profiles.location_id`.

**No invite flow — and do not build one.** Creating auth users requires the
`service_role` key, which must never reach the browser. Instead show a clear
panel, in both languages:

> To add a staff member, ask them to sign up at `/admin/login`. They will appear
> here as a customer, and you can then give them a role.

**Activity log** below the list (owner/manager only): `audit_log` newest first —
actor name, action, entity, entity_id, timestamp, and an expandable JSON diff.
Paginated, filterable by entity, strictly read-only. It is append-only by
design; there is no policy permitting insert, update or delete, so do not add
controls for those.

---

## Notes

- Dates via `date-fns` with the Arabic locale when `locale === 'ar'`.
- Empty states matter: the database currently has **zero customers**, 2 discount
  codes, and possibly zero staff rows.

## Gate

Every gate command in `REMAINING_WORK.md`, plus confirm
`rpc('validate_discount'` appears in `DiscountsPage.tsx`.
