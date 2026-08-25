# Progress log — Vitality completion

Written as work proceeds. Each section: what was built, the real gate output,
and anything left unfinished.

Gate commands (from `REMAINING_WORK.md`), run from the repo root:
1. `npx tsc --noEmit` — must exit clean
2. `npm run build` — must succeed
3. physical-direction / `any` grep — must return nothing
4. `toast.(success|error|info)('English'` grep — must return nothing
5. `throw new Error('English'` grep (*.tsx) — must return nothing

---

## Step 0 — P7 leftovers (PurchasingPage.tsx)

**Owned file:** `src/admin/pages/PurchasingPage.tsx` (+ 1 translation key).

### 0.1 — Empty `variant_id` reaching the database — FIXED
`CreatePOModal`:
- Added a per-row guard in `saveMutation`: throws `t('purchasing.errorInvalidItemRow')`
  if any row has an empty `variant_id` or `quantity < 1`, before any insert.
- Added `canSave` (supplier + branch + at least one fully-filled row) and wired
  it to the Save button's `disabled`, so a blank variant dropdown can't be saved.
- New key `purchasing.errorInvalidItemRow` added in both `en` and `ar`.

### 0.2 — Non-atomic PO edit (delete-then-insert) — FIXED
`CreatePOModal` edit branch rewritten to the safe order:
1. capture existing line-item ids,
2. **insert** the new rows,
3. **delete** the old rows by id,
4. update the PO header last.
A failed insert now leaves the PO's existing line items intact instead of
wiping them. Confirmed via `pg_constraint` that there is **no** unique
`(purchase_order_id, variant_id)` constraint (only PK on `id`, FKs, and CHECKs),
so transiently holding both old and new rows is safe.

### 0.3 — Barcode path untestable (all barcodes null) — FIXED (seeded)
All 76 variants had `barcode = null`. Seeded 6 real barcodes on the
`CORELONGSLEEVE` variants so the stocktake scan path can be exercised:

| SKU | barcode |
|---|---|
| VT-CORELONGSLEEVE-L-BLK | 6206000000001 |
| VT-CORELONGSLEEVE-L-MOS | 6206000000002 |
| VT-CORELONGSLEEVE-L-STN | 6206000000003 |
| VT-CORELONGSLEEVE-M-BLK | 6206000000004 |
| VT-CORELONGSLEEVE-M-MOS | 6206000000005 |
| VT-CORELONGSLEEVE-M-STN | 6206000000006 |

The stocktake barcode-search code was already correct; it now has data to match
against. I did not re-run the live scan UI in this session, so I am not claiming
the scan flow "works" — only that it is now exercisable with the barcodes above.

### Gate output

- `npx tsc --noEmit` → **clean**, `TSC_EXIT=0`.
- `npm run build` → **success**, `BUILD_EXIT=0` (`✓ built in 11.67s`; only the
  pre-existing >500 kB chunk-size advisory, which is a warning, not an error).
- Grep 3 (physical-direction / `any`) → **nothing**.
- Grep 4 (toast English literals) → **nothing**.
- Grep 5 (thrown English literals, *.tsx) → **NOT empty**, but every hit is
  pre-existing code from earlier packages; **none are in `PurchasingPage.tsx`**:
  - `lib/auth.tsx:192`, `lib/i18n.tsx:74` — React provider-guard throws
    (`useAuth`/`useLocale` used outside their provider). These fire before any
    locale context exists and are **never surfaced to a user**; they are
    structurally impossible to route through `t()`. This is why grep 5 can never
    be literally empty on this repo.
  - `admin/pages/OrderDetailPage.tsx:144/170/196` (`'Order not found'`),
    `admin/pos/PaymentModal.tsx:59`, `admin/pos/ShiftBar.tsx:93/94/118/119`,
    `admin/products/ProductEditor.tsx:318` — thrown English literals in prior
    packages (Orders, POS, Products). Several of these *are* reachable through a
    `mutationFn`→`toast.error(e.message)` path and are genuine rule-8 defects,
    but they are outside every file this session's packages own and pre-date this
    session. I did not modify these reviewed, out-of-scope files as part of
    Step 0. **Flagged here for the owner.**

**Step 0 status: DONE** for the three assigned fixes. Grep 5 is clean for the
owned file; the remaining hits are pre-existing and enumerated above.

---

## P8 — Customers + Discounts + Staff

**Owned files:** `src/admin/pages/CustomersPage.tsx`,
`src/admin/pages/DiscountsPage.tsx`, `src/admin/pages/StaffPage.tsx`,
`src/lib/translations.ts` (added keys only).

### A. Customers — built
- Server-side paginated list (25/page) from `customers`: name, phone (`dir="ltr"`),
  city, orders, spend (`formatMoney`), points, last order, blocked badge.
- `SearchInput` on full_name/phone/email, sanitised by stripping `,()."\` and
  skipping the `.or()` filter entirely if nothing survives (mirrors the
  sanitisation already used in `OrdersPage.tsx`).
- Filters: has-orders / no-orders, blocked / not-blocked. Sort by total_spent
  or last_order_at, descending.
- Create/edit `Modal`: full_name (required), phone, email, city, birthday,
  tags (chip input), notes. Catches Postgres `23505` on the phone unique index
  and shows `customers.errorPhoneExists` instead of the raw error.
- Detail `Drawer`: lifetime spend, order count, average order value, loyalty
  balance, member-since; order history linking to `/admin/orders/:id`; loyalty
  ledger from `loyalty_transactions`; addresses from `customer_addresses`;
  adjust-points panel that **inserts into `loyalty_transactions`** (never
  writes `customers.loyalty_points` directly — the DB trigger keeps the
  balance in sync); block/unblock toggling `customers.is_blocked`.
- Rule 1 respected: the `useCan('customers')` guard is the last statement
  before the `return`, after every hook.

### B. Discounts — built
- List: code (`dir="ltr"`, uppercase, monospace), description, type badge,
  value (`formatPercent(v, locale, { isWholeNumber: true })` for percentage
  types — verified this is used, not raw `%`), min subtotal, used/limit,
  validity window, active badge, plus separate Expired/Exhausted badges
  computed client-side from `ends_at`/`usage_limit`.
- Create/edit `Modal` covers every column named in the spec: code, description,
  type, value, min_subtotal, max_discount, usage_limit, per_customer_limit,
  starts_at, ends_at, is_active, category scope, product scope.
- Client-side validation mirroring the DB CHECK constraints, in plain language:
  value > 0, percentage ≤ 100, ends_at after starts_at, and a friendly message
  on the `23505` unique-code violation.
- Test panel: calls `rpc('validate_discount', { p_code, p_subtotal })` with a
  chosen code and a sample subtotal, shows the computed amount or the
  rejection `reason` verbatim.
- Inline activate/deactivate toggle. Delete is allowed with a confirm dialog
  that explicitly warns existing orders keep the code as a snapshot.

### C. Staff — built
- List from `profiles` (role ≠ customer): name, phone, role, branch,
  active/inactive, last seen.
- Role `Select` over `app_role`, gated: only shown as an editable dropdown when
  `canChangeRole` is true. Guard rails implemented exactly as specified —
  nobody may edit their own row (checked via `useAuth().user.id`), a manager
  cannot see `owner` as an option unless the target is already an owner
  (so a manager can never promote *to* owner, matching "only an owner may
  promote someone to owner"), and the last remaining active owner cannot be
  demoted (`ownerCount <= 1` check). Non-editable rows show a badge plus a
  one-line reason (`staff.cannotChangeSelf` / `staff.lastOwner` /
  `staff.ownerOnly`).
- Activate/deactivate toggle on `profiles.is_active`, disabled on your own row.
- Default branch via a `Select` writing `profiles.location_id`.
- No invite flow, as instructed — a static bilingual panel telling the owner
  to have new staff sign up at `/admin/login` and then be given a role here.
- Read-only, paginated (25/page) activity log from `audit_log` newest-first:
  actor name (joined via `profiles`), action, entity (+ short entity_id),
  timestamp, and an expandable raw JSON `changes` diff. Filterable by entity.
  No insert/update/delete controls, matching the append-only policy.

### Translations
Added ~150 new keys (`role.*`, `customers.*`, `discounts.*`, `staff.*`) in
both `en` and `ar` — natural Arabic, not transliteration.

### Gate output

- `npx tsc --noEmit` → **clean**, `TSC_EXIT=0`.
- `npm run build` → **success**, `BUILD_EXIT=0` (`✓ built in 6.97s`; only the
  pre-existing >500 kB chunk-size advisory).
- Grep 3 (physical-direction / `any`) → **nothing**.
- Grep 4 (toast English literals) → **nothing**.
- Grep 5 (thrown English literals, *.tsx) → same pre-existing hits as in the
  Step 0 report (`OrderDetailPage.tsx`, `PaymentModal.tsx`, `ShiftBar.tsx`,
  `ProductEditor.tsx`, `auth.tsx`, `i18n.tsx`) — **none in
  `CustomersPage.tsx`, `DiscountsPage.tsx`, or `StaffPage.tsx`**.
- RPC call-site check (`rpc\('validate_discount'`) →
  `src/admin/pages/DiscountsPage.tsx:335` and `src/admin/pages/POSPage.tsx:368`
  (POS already called it; Discounts now does too, in the test panel).

### Not verified — say so plainly
I did **not** click through these three pages in a live authenticated browser
session. The project currently has zero users (`auth.users` is empty), so
verifying `/admin/customers`, `/admin/discounts`, `/admin/staff` requires
signing up a first account (which becomes `owner` automatically). I attempted
this in the dev-server browser preview; after a few submit attempts Supabase's
own signup endpoint returned `429 over_email_send_rate_limit` and no user was
ever created (confirmed empty `auth.users` via SQL). I did not work around
this (e.g. by inserting directly into `auth.users`), since that bypasses
Supabase Auth entirely and would not represent a real signup path. I am
therefore reporting P8 as gate-clean and code-reviewed, but **not**
click-tested end-to-end. The owner should sign up once the rate limit clears
and confirm the three pages render as expected.

---

## P9 — Reports + Cash & Shifts

**Owned files:** `src/admin/pages/ReportsPage.tsx`,
`src/admin/pages/CashPage.tsx`, new `src/admin/reports/` (`ReportFilters.tsx`,
`SalesTab.tsx`, `ProductsTab.tsx`, `BusiestTimesTab.tsx`, `StaffTab.tsx`,
`InventoryTab.tsx`, `csv.ts`), new `src/admin/cash/` (`ShiftPanel.tsx`,
`ShiftHistoryList.tsx`, `ExpensesSection.tsx`, `ZReportSection.tsx`),
`src/index.css` (added a `@media print` rule scoped to `#z-report-print`),
`src/lib/translations.ts` (added keys only).

### A spec/reality mismatch worth flagging up front
I read the actual `pg_views` definitions for every view this package uses
before writing code (not just the column list in `database.types.ts`). Three
of the five report views are **structurally all-time and/or branch-global** —
they carry no date or `location_id` column to filter by:

- `v_product_performance` — no date column, no location column. All-time,
  all-branches, full stop.
- `v_sales_by_hour` — same: no date range, no location.
- `v_staff_sales` — has `day` (date range works) but **no `location_id`**
  (branch filter cannot apply).

The spec says "Every tab respects both [date range and branch]." For these
three tabs that is not achievable without inventing a new view or column,
which I was told not to do. Rather than silently ignoring the shared filters
on those tabs (which would look like a bug) or pretending they work, I:
- Still render the shared filter bar (so Sales and Inventory, which genuinely
  support it, work correctly).
- Show an explicit, translated hint on the Products, Busiest Times, and Staff
  tabs stating exactly which filter(s) do not apply and why.
- Documented it here.

`v_daily_sales` (Sales tab) and `v_inventory_valuation` (Inventory tab,
branch only — it's a stock snapshot, not date-ranged, which matches the
spec's own framing of "stock value ... per branch") both fully support their
applicable filters.

### A. Reports — built
- Shared `ReportFiltersBar`: date presets (today, last 7, last 30, this month,
  last month, custom) plus a branch dropdown. State lives in `useReportFilters()`
  and is threaded into whichever tab can use it.
- **Sales tab** — `v_daily_sales`, filtered by day range and `location_id`.
  Area chart (RTL-aware: `reversed={isRTL}`, `orientation={isRTL?'right':'left'}`,
  money-formatted ticks/tooltips) plus a totals row (orders, gross revenue,
  discounts, refunds, net revenue, AOV). CSV export.
- **Products & profit tab** — `v_product_performance`, sortable by every
  numeric column (units, revenue, cost, profit, margin, returned). Negative
  margin rows highlighted `danger`. Hint when products have `cost_price = 0`
  and units sold, so the owner knows why profit reads as 100% margin. CSV
  export.
- **Busiest times tab** — `v_sales_by_hour` rendered as a 7×24 heatmap
  (day-of-week × hour-of-day), colour intensity by revenue, days labelled in
  the active locale (`day_of_week = 0` → Sunday, per `extract(dow)`).
- **Staff performance tab** — `v_staff_sales` aggregated per cashier over the
  date range, sorted as a leaderboard, trophy icon on first place. CSV export.
- **Inventory tab** — `v_inventory_valuation` (cost/retail value per branch,
  filterable) plus a **slow movers** panel I compute client-side: products
  with `units_sold = 0` from `v_product_performance`, cross-referenced against
  `inventory_levels × product_variants × products` to compute the tied-up
  stock value (`quantity × cost_price`, falling back to the product's
  cost_price when the variant has none, same rule the `v_inventory_valuation`
  view itself uses). No view exists for this, so it's composed from existing
  tables only — no new column or RPC invented. CSV export.
- CSV export (`src/admin/reports/csv.ts`): builds the CSV in the browser from
  already-fetched rows, quotes fields containing commas/quotes, prepends a
  UTF-8 BOM, downloads via `Blob` + object URL. Used on all five tabs.

### B. Cash & Shifts — built
- **Branch selector** at the top of the page, defaulting to the signed-in
  staff member's `profiles.location_id` if set, else the first active branch.
- **Current shift panel** (`ShiftPanel.tsx`): shows "no shift" state with an
  Open Shift action (`rpc('open_shift', { p_location_id, p_opening_float })`)
  when none is open; otherwise who/when opened, opening float, and live
  expected cash from `rpc('shift_expected_cash', { p_shift_id })`
  (`refetchInterval: 15000` so it stays live without a manual refresh).
- **Pay in / pay out**: `rpc('record_cash_movement', { p_shift_id, p_type, p_amount, p_reason })`,
  UI restricts `p_type` to exactly `'pay_in' | 'pay_out'` per the spec (the
  RPC itself also rejects anything else).
- **Close shift**: asks for counted cash, shows expected cash + colour-coded
  variance (`success` at 0, `warning` under ~50 EGP, `danger` beyond) before
  confirming, then `rpc('close_shift', { p_shift_id, p_counted_cash, p_notes })`.
- **Shift history** (`ShiftHistoryList.tsx`): closed shifts, branch,
  opened/closed by + time, opening float, expected, counted, coloured
  variance badge. Click a row to expand its full `cash_movements` ledger
  (type badge, signed+coloured amount, reason, linked order number via a
  join to `orders(order_number)`, time). Paginated, 20/page.
- **Expenses** (`ExpensesSection.tsx`): list (date, category, amount, note,
  branch, recorded-by, drawer flag) + add form (category, amount, note, date,
  branch, `paid_from_drawer` checkbox). Inserts directly into `expenses` —
  **does not** insert a matching `cash_movements` row itself, since the
  database trigger already does that when `paid_from_drawer` is true and a
  `shift_id` is set (confirmed this in the spec and did not duplicate it).
  The drawer checkbox is disabled when there's no open shift at the branch,
  since there is nothing to attach the movement to.
- **Z-report** (`ZReportSection.tsx`): for a chosen day + the selected branch,
  aggregates every shift opened that day at that location and sums their
  `cash_movements` by type (opening float, cash sales, refunds, pay-ins,
  pay-outs, expenses), plus expected/counted/variance. Printable via
  `window.print()`; added a `@media print` rule in `src/index.css` scoped to
  `#z-report-print` so only the report prints.

### Translations
Added ~90 new keys (`reports.*`, `cash.*`) in both `en` and `ar`.

### Gate output

- `npx tsc --noEmit` → **clean**, `TSC_EXIT=0` (after fixing two real type
  errors during development: a template-literal key on an unnarrowed
  `string` category value — replaced with an explicit `switch`, no cast; and
  an `interface` that didn't get the implicit index signature
  `useLocalized()`'s generic constraint needs — changed to a `type` alias,
  matching the pattern already used elsewhere in this codebase).
- `npm run build` → **success**, `BUILD_EXIT=0` (`✓ built in 7.15s`; only the
  pre-existing >500 kB chunk-size advisory).
- Grep 3 (physical-direction / `any`) → **nothing**. (Note: the print CSS
  rule intentionally avoids the logical-property *strings* `inset-block`/
  `inset-inline` even though using them correctly as raw CSS properties —
  not Tailwind classes — would have been legitimate; the grep gate matches
  the literal substring anywhere in `.css` files, so I used `top: 0; width:
  100%` instead, which is direction-safe here since the block is full-width.)
- Grep 4 (toast English literals) → **nothing**.
- Grep 5 (thrown English literals, *.tsx) → same pre-existing hits as prior
  reports — **none in any P9 file**.
- P9 RPC call-site check
  (`open_shift|close_shift|record_cash_movement|shift_expected_cash`) → all
  four appear in `src/admin/cash/ShiftPanel.tsx` (lines 53, 71, 91, 112) —
  confirmed with real line numbers.

### Not verified — say so plainly
Same constraint as P8: no live authenticated session was available (signup
rate-limited, `auth.users` still empty), so I did not click through
`/admin/reports` or `/admin/cash` in the browser. I did confirm via the dev
server that every new module imports and transforms without error (Vite
build succeeded, no console/server errors on load), which rules out import
cycles, syntax errors, and missing exports, but is not the same as exercising
the UI against live data. The owner should verify once a staff account
exists — in particular the Z-report's day-based shift query and the slow
movers cross-reference, since the seeded database has no orders yet and the
zero-order/zero-shift states should be tested for realistic empty-state
behaviour (both have empty states wired, but empty states written against
imagined data are exactly the kind of thing that should get a real look).

---

## P10 — Storefront CMS + Settings

**Owned files:** `src/admin/pages/StorefrontPage.tsx`,
`src/admin/pages/SettingsPage.tsx`, new `src/admin/settings/`
(`ContentBlocksTab.tsx`, `MarqueeTab.tsx`, `CollectionsTab.tsx`,
`ReviewsTab.tsx`, `NewsletterTab.tsx`, `StoreSettingsTab.tsx`,
`BranchesTab.tsx`, `CategoriesBrandsTab.tsx`, `mediaUpload.ts`),
`src/lib/translations.ts` (added keys only).

This package is what P11/P12 will read from, so it was built and gated before
either.

### A. Storefront CMS — built
- **Tab 1 — Hero & content blocks.** Edits the two seeded `content_blocks`
  rows (`hero`, `rewards`): bilingual title/subtitle/body/CTA fields side by
  side, `cta_href`, `is_active`. Media: paste a URL, or upload via the same
  `product-images` Storage-bucket pattern used by
  `ProductEditor.tsx` (validated to image/video, 5 MB cap) —
  `src/admin/settings/mediaUpload.ts` extracts that pattern into a small
  shared helper. The hero falls back to `/vitality-hero.mp4` when the field
  is empty. A live preview panel renders the actual gradient/overlay
  treatment in the active locale, including the CTA pill.
- **Tab 2 — Marquee.** Full CRUD on `marquee_messages` (bilingual text,
  active toggle), plus up/down reordering that swaps `position` between two
  rows.
- **Tab 3 — Collections.** CRUD on `collections` (slug, bilingual
  title/subtitle, image URL, active). "Manage Products" opens a drawer with a
  sanitised product search (same `,()."\` stripping rule as elsewhere) that
  inserts into `collection_products`, plus up/down reordering and removal for
  existing members. Two seeded collections (`new-arrivals`, `bestsellers`)
  render correctly against this.
- **Tab 4 — Reviews moderation.** Filterable by status. Approve/reject
  updates `reviews.status` only — I do **not** write
  `products.rating_avg`/`rating_count`, since a trigger recomputes those
  (confirmed in the spec; did not re-verify the trigger exists server-side
  beyond trusting the spec here, since reviews table is currently empty and
  there's nothing to observe it firing against). Optional store reply sets
  `reply` + `replied_at`.
- **Tab 5 — Newsletter.** Read-only list of `newsletter_subscribers` +
  CSV export using the same BOM/quoting helper from P9
  (`src/admin/reports/csv.ts`, imported rather than duplicated).

### B. Settings — built
- **Structured forms, not raw JSON**, for all six seeded `settings` rows
  (`store`, `loyalty`, `shipping`, `tax`, `receipt`, `inventory`), each field
  typed to match the real seeded JSON shape — I read the live rows via SQL
  before writing the TypeScript interfaces, rather than guessing the shape
  from the spec's field list alone. Each section explains its real-world
  effect in plain language (loyalty shows a worked example computed from the
  live values; shipping and loyalty hints explicitly name the RPCs they
  drive, per the spec). `is_public` is shown as a read-only badge
  (`settings.publicYes` / `settings.publicNo`), never an editable control.
- **Branches** — full CRUD on `locations` (bilingual name, code, address,
  city, phone, warehouse flag, `sells_online`, active). Deactivating the last
  active branch with `sells_online = true` is intercepted by a
  `ConfirmDialog` that quotes the exact failure the storefront would hit
  ("No branch is available to fulfil online orders"), per the spec.
- **Categories & brands** — CRUD on `categories` (with a `parent_id` picker
  excluding the row being edited, to prevent self-parenting) and `brands`.
- **Read-only enforcement for non-managers**: every write control in
  Settings is gated behind `role === 'owner' || role === 'manager'`
  (`canWrite`), matching "a cashier opening this page should see it
  read-only." **However** — I verified this against `src/lib/auth.tsx`'s
  `PERMISSIONS` matrix and it does not actually matter in practice: `'settings'`
  is not in the cashier, stock, or viewer permission lists, so `useCan('settings')`
  already blocks every non-owner/non-manager role at the page level, before
  `canWrite` is ever evaluated. The spec's cashier-sees-read-only scenario is
  therefore currently unreachable. I built the `canWrite` gating anyway,
  since it's cheap, matches the spec's letter, and would start doing real
  work if the permission matrix ever changes — but I want it on record that
  it is presently dead code, not a verified live path. I did not touch
  `auth.tsx` (out of scope for this package).

### RLS check
Before claiming the manager-only write rule, I queried `pg_policies` on
`settings` directly: `settings_manager_write` (cmd `ALL`) requires
`is_manager()`; `settings_public_read` (cmd `SELECT`) requires
`is_public OR is_staff()`. This confirms the spec's claim and confirms my
read-only UI treatment lines up with what the database actually enforces.

### Round-trip verification (per the P10 gate's extra requirement)
I could not do this through the actual admin UI — no staff session exists
(see the P8/P9 notes on the signup rate limit). Instead I proved the
**write shape** round-trips correctly at the database level: read the live
`tax` row (`{"rate":0,"enabled":false}`), wrote it to
`{"rate":0.14,"enabled":true}` — the exact JSON shape `TaxSection`'s save
button sends — read it back and confirmed both fields persisted, then
restored the original value. This confirms my TypeScript interfaces and
payload shapes are byte-for-byte correct against the live schema. It does
**not** confirm the actual `/admin/settings` UI round-trips through a real
browser session with RLS enforced as a manager, because that path is still
blocked by the same auth constraint as P8/P9.

### Translations
Added ~130 new keys (`cms.*`, `settings.*`) in both `en` and `ar`.

### Gate output

- `npx tsc --noEmit` → **clean**, `TSC_EXIT=0` (one real error caught and
  fixed during development: `ReviewsTab`'s update payload was typed as
  `Partial<Review>`, a local type that includes the joined `products`
  relation — Supabase correctly rejected it as an update shape. Retyped the
  patch as `Partial<Tables<'reviews'>>`, the actual table row type).
- `npm run build` → **success**, `BUILD_EXIT=0` (`✓ built in 11.56s`; only the
  pre-existing >500 kB chunk-size advisory, now a bit larger with this
  package's code).
- Grep 3 (physical-direction / `any`) → **nothing**.
- Grep 4 (toast English literals) → **nothing**.
- Grep 5 (thrown English literals, *.tsx) → same pre-existing hits as every
  prior report — **none in any P10 file**.

### Not finished / not verified — say so plainly
- **No live click-through of either page.** Same root cause as P8 and P9:
  Supabase signup is still rate-limited from earlier attempts and
  `auth.users` remains empty. I verified correctness through (a) reading the
  actual `pg_views`/`pg_policies`/table definitions before writing code
  rather than guessing, (b) a database-level round-trip of the exact write
  shape, and (c) a clean dev-server load with no console/server errors — but
  none of that is a substitute for a human clicking through
  `/admin/storefront` and `/admin/settings` as a real owner/manager. This
  should be the first thing checked once a staff account exists.
- **Collections drawer's nested Supabase select** (`collection_products`
  joined to `products`) is force-cast past Supabase's embedded-select type
  inference (`as unknown as Array<{...}>`) rather than relying on it, the
  same defensive choice made in P9's inventory query — this is a deliberate,
  narrow cast (not `any`), not a shortcut around a real type error.

---

## P11 — Storefront: shell, home, catalog, product page

**Owned files:** new `src/storefront/` (`StoreLayout.tsx`, `useCart.tsx`,
`useWishlist.tsx`, `lib.ts`, `components/ProductCard.tsx`,
`pages/HomePage.tsx`, `pages/CatalogPage.tsx`, `pages/ProductPage.tsx`), the
`/` route tree in `src/App.tsx`, `src/lib/translations.ts` (added keys only),
`src/index.css` (added `@keyframes store-marquee`).

Unlike P8–P10, the storefront is public, so — unlike every prior package this
session — I could actually run the P11 gate's explicit live-browser check
instead of reporting it as blocked. Details below.

### Design decisions worth flagging

**Cart and wishlist had to become Context providers, not plain hooks.**
The spec says "put the cart store in `src/storefront/useCart.ts`", but a
plain `useState`-based hook (the pattern the admin POS cart uses) does not
share state across independently-mounted route components — the nav badge,
the product page, and the future cart page are siblings under `StoreLayout`,
not parent/child, so each would get its own isolated cart if I'd copied the
POS pattern verbatim. I built `useCart.tsx` and `useWishlist.tsx` as
Context providers instead (same shape as the existing `AuthProvider`/
`LocaleProvider` in `src/lib/`), wrapped around the storefront route subtree
in `App.tsx`. Confirmed this actually matters, not just theoretically, by
adding a jacket to the bag on the product page and checking the nav badge
updated live (see verification below) — deleted the stray non-Context
`useCart.ts` file once I'd rebuilt it as `.tsx`, so there's exactly one
implementation, not two.

**`color_hex` isn't on `v_storefront_products`.** The view exposes
`colors: string[]` (names only, from `array_agg(DISTINCT v.color_name)`) —
there is no hex value to paint the placeholder block with. Rather than invent
a pseudo-color or add a column, `src/storefront/lib.ts` does one batched
`product_variants` query per page load (not per-card) to build a
product-id → first-active-variant-color_hex map, which is what
`ProductCard` and the home page pass down. This matches the spec's literal
instruction ("render a flat block using the variant's `color_hex`") using
only existing columns.

**"Men" / "Women" nav links go to `/shop`, same as "Shop."** There is no
gender field anywhere in the schema — `categories` are Tops/Bottoms/
Outerwear/Accessories, not gendered — and the original
`docs/original-storefront.html` itself treats Shop/Men/Women as identical
anchors to the same `#catalog` section (I read the original's JS: all three
tabs map to `activeCategory` values that don't include "men" or "women"
either). I matched the original's actual behaviour rather than inventing a
gender taxonomy that doesn't exist in the database.

**Rewards promo stat is data-driven, not hardcoded.** The original's static
HTML says "1pt per $1 spent" as literal markup. I fetch the public `loyalty`
setting via `rpc('get_setting', { p_key: 'loyalty' })` (readable by anon —
confirmed via `pg_policies` in the P10 work) and render the real
`points_per_currency` value, only showing the stat at all when
`loyalty.enabled` is true. A hardcoded "1pt" would silently go stale the
moment an owner changes the loyalty settings from `/admin/settings`.

### A. Storefront shell — built
Sticky nav (wordmark, Shop/Men/Women/Rewards, search overlay, language
toggle, wishlist/cart icons with live count badges), mobile hamburger menu,
marquee ticker from `marquee_messages` (active, ordered by `position`,
paused under `prefers-reduced-motion` via both the existing global rule and
an explicit `motion-reduce:animate-none` class), footer with a newsletter
form that inserts into `newsletter_subscribers` (anon insert, per RLS) with
email validation and a duplicate-email (`23505`) message distinct from a
generic error. `<Outlet />` renders the page tree. No `RequireStaff`
anywhere in this file, per the spec's explicit instruction — this is the
customer-facing auth surface, not the staff one.

### B. Home page — built
Hero from `content_blocks` where `key = 'hero'` (video or image per
`media_type`, grayscale + gradient overlay, falls back to
`/vitality-hero.mp4` when `media_url` is empty, `autoplay muted loop
playsinline`). New arrivals (`is_new`, limit 8) and Featured
(`is_featured`) grids. Collections grid linking to `/collections/:slug`.
Rewards promo from `content_blocks` where `key = 'rewards'`, with the
data-driven loyalty stat described above.

### C. Catalog — built
`/shop` and `/collections/:slug` share one `CatalogPage` component; the
collection variant first resolves the collection by slug, pulls its
`collection_products` membership, then applies the exact same filter/sort
pipeline on top of that id set. Filters: category (real facet from
`categories`), size and colour (real facets computed from the
`sizes`/`colors` array columns across all products, using Postgres array
`.contains()`), price range, in-stock only. Sort: newest, price asc/desc,
best-selling (`total_sold`). Search matches `name_en`/`name_ar`, sanitised
with the same `,()."\`-stripping rule used everywhere else in this project
before hitting `.or()`. Every filter is reflected in the URL query string via
`useSearchParams` (confirmed live — see below) so a filtered view is
shareable and survives reload. "Load more" pagination (12 at a time) rather
than numbered pages, matching the storefront's continuous-scroll feel.
Empty state with a reset action when filters match nothing.

### D. Product page — built
Gallery from `product_images` ordered by `position`, falling back to the
colour block; when a colour swatch is clicked, the gallery filters to that
colour's images if any exist. Name/price/compare-at/description/material/care
all localized via `useLocalized()`. **Stock-aware size/colour selection**:
loads the product's active variants, then a batched `inventory_levels` query
scoped to branches where `is_active = true AND sells_online = true`
(confirmed `inventory_levels` is fully public-read via `pg_policies`),
summed as `quantity - reserved` per variant. A size/colour combination with
zero available renders disabled and struck through; "Only N left" appears at
≤5. The resolved combination always maps to exactly one `product_variants.id`
— that id, not the product id, is what gets added to the cart. Quantity
stepper capped at available stock. Reviews: approved-only list with average/
count from `products.rating_avg`/`rating_count`; a signed-in user can submit
one (`user_id = auth.uid()`, `status = 'pending'`, told explicitly it awaits
approval); signed-out visitors see a sign-in prompt instead of a broken form.
Related products from the same category.

### Translations
Added ~95 new `store.*` keys in both `en` and `ar`.

### Gate output

- `npx tsc --noEmit` → **clean**, `TSC_EXIT=0`.
- `npm run build` → **success**, `BUILD_EXIT=0` (`✓ built in 9.68s`; only the
  pre-existing >500 kB chunk-size advisory).
- Grep 3 (physical-direction / `any`) → **nothing**.
- Grep 4 (toast English literals) → **nothing**.
- Grep 5 (thrown English literals, *.tsx) → the same pre-existing hits as
  every prior report, **plus two new, structurally identical ones**:
  `src/storefront/useCart.tsx:112` and `src/storefront/useWishlist.tsx:68`
  — both are the "used outside its Provider" guard, the exact same pattern
  as the pre-existing `useAuth`/`useLocale` guards flagged in every earlier
  report. They fire before any UI exists to show a toast and can never reach
  `onError`/`toast.error`, so they're not a rule-8 defect — I'm calling them
  out explicitly rather than letting them blend into the "pre-existing" list.

### Live verification (this package's gate explicitly requires it, and unlike
every prior package this session, the storefront doesn't require staff auth,
so I could actually do it)
Ran `npm run dev`, opened the storefront in the browser tool, and confirmed:
1. **Home, Arabic (default locale)** — hero, new arrivals (3 real seeded
   products with correct EGP/Arabic-numeral pricing and compare-at
   strikethrough on Field jacket), Collections, Featured, and the rewards
   promo showing the real `1pt`/`loyalty` value all rendered with zero
   console errors.
2. **Language toggle** — switched to English live; all of the above
   re-rendered correctly in English/LTR (`EGP 1,900` etc.).
3. **Catalog (`/shop`)** — all 8 seeded products rendered with real facet
   options (4 categories, 5 sizes, 3 colours) populated from live data.
   Selected "Outerwear" in the category filter and confirmed the grid
   narrowed to exactly the 2 outerwear products **and** the URL updated to
   `/shop?category=579b6c51-...` — proving the URL-reflects-filters
   requirement actually works, not just compiles.
4. **Product page (`/product/field-jacket`)** — rendered name, price with
   compare-at strikethrough, description, material/care, 3 colour swatches,
   4 size buttons, "In stock" hint, quantity stepper, Add to bag, wishlist
   heart, an empty reviews section with a sign-in prompt, and one related
   product (Shell vest, same category). Clicked "Add to bag" with S/Black
   selected and confirmed via `localStorage['vitality.shop.cart']` that the
   line was written correctly — keyed by the real `variant_id`
   (`1b702989-...`), not the product id, with `quantity: 1`,
   `price: 5900`. **Confirmed the nav cart badge updated to "1" on the same
   page** without a reload, which is the direct proof that the Context-based
   cart rebuild (see design decisions above) actually shares state across
   the route tree instead of silently not working. Cleared the test
   `localStorage` entry afterward so it doesn't leak into P12 testing.

I did not test RTL-flip visuals (mirrored icons, `dir="rtl"` layout) with a
screenshot — this environment's screenshot tool is non-functional here
("Browser pane is not displayed"), so I relied on `get_page_text` and
`read_page`'s accessibility tree, which confirm content and structure but
not pixel-level mirroring. The Arabic pass above did confirm real Arabic
text, Eastern Arabic numerals, and `dir`-correct money formatting, which is
the substantive RTL behaviour; the owner should still eyeball the mirrored
layout once, since chevrons/icons flipping correctly is a visual property I
could not directly observe.

---

## P12 — Storefront: cart, checkout, tracking, account

**Owned files:** `src/storefront/useCart.tsx` (extended), `src/storefront/lib.ts`
(extended), new `src/storefront/useCustomer.ts`,
`src/storefront/components/CartLines.tsx`, `src/storefront/components/CartDrawer.tsx`,
`src/storefront/pages/CartPage.tsx`, `CheckoutPage.tsx`,
`OrderConfirmationPage.tsx`, `TrackOrderPage.tsx`, `AccountLoginPage.tsx`,
`AccountLayout.tsx`, `pages/account/{OrdersSection,ProfileSection,
AddressesSection,LoyaltySection,WishlistSection}.tsx`, the remaining routes in
`src/App.tsx`, `src/storefront/StoreLayout.tsx` (bag icon now opens the
drawer), `src/lib/translations.ts` (added keys only).

### A spec-vs-schema decision made before writing code
Before building `/track`, I queried `pg_policies` directly on `orders`,
`order_items`, `order_events`, `customers`, `customer_addresses`, and
`loyalty_transactions`. Every one of them is scoped to
`is_staff() OR customer_id = my_customer_id()` (or the equivalent
`user_id = auth.uid()`), with **no policy permitting anonymous reads at
all** — not even a restricted "status only" read. The spec's own escape
valve says: *"if you cannot do it safely with what exists, say so … and
implement the signed-in path only."* I did that:
`/track` requires sign-in; a guest sees an honest message and a sign-in
link, not a broken form or a silently-empty result. I did not add an RPC or
loosen RLS to make guest tracking possible, per the explicit prohibition.
I also read the actual SQL body of `create_online_order`, `handle_new_user`,
and `my_customer_id()` (not just their signatures) before writing the
account pages, which is how I knew: (a) `customers` rows are matched by
**phone**, not created eagerly on signup — a brand-new signed-up user who
has never ordered has no `customers` row yet, so Profile/Addresses/Loyalty
must all handle that as an empty state, not an error (built exactly that);
(b) the confirmation page cannot safely re-fetch an order for a guest on
reload, only for a signed-in customer whose `customer_id` now matches — so
`OrderConfirmationPage` primarily reads from router `state` passed
immediately after the RPC returns, with a signed-in-only fallback re-fetch
and an honest unavailable-message otherwise.

### A. Cart — built
Extended `CartProvider` (not a new file — the P11 Context rebuild already
lived here) with the stock re-validation the spec requires: once per
session, on mount, it batches an `inventory_levels` query (scoped to
`is_active AND sells_online` branches) for every `variant_id` in the cart,
drops lines whose variant is gone or at 0 available, caps quantities at
what remains, and shows one toast if anything changed. `CartLines.tsx` is
shared between the new slide-over `CartDrawer` (opened from the nav bag
icon, which I changed from a `Link` to a `button` for this) and the full
`/cart` page — quantity steppers capped at live availability, remove,
subtotal, and a free-shipping progress hint driven by
`rpc('get_setting', { p_key: 'shipping' })`. Empty state links back to `/shop`.

### B. Checkout — built
Single `/checkout` page, sectioned exactly per spec: Contact (prefilled from
the signed-in customer's row when available), Fulfilment (delivery/pickup,
branch picker for pickup), Address (delivery only; signed-in customers can
pick a saved `customer_addresses` row or enter a new one), Discount code
(live `rpc('validate_discount', { p_code, p_subtotal })`, shows the amount
or the rejection `reason`), Summary (subtotal/discount/shipping/total —
shipping preview computed client-side purely for display, exactly mirroring
the RPC's own flat-fee/free-over logic, and explicitly labelled), Notes.
Places the order with **exactly one** `rpc('create_online_order', …)` call
— never sends a computed total or any price, only `variant_id` +
`quantity` per the spec's explicit warning. Place Order is disabled for the
whole duration of the mutation (React Query's `isPending` plus a local
`placing` flag set in `onMutate`, cleared only on error) so a double-click
cannot fire two requests. On success: `clear()`s the cart, then
`navigate('/order/:orderNumber', { state: { order } })`.

### C. Confirmation — built
Order number (`dir="ltr"`), line items, totals, fulfilment method, and an
explicit cash-expectation line that differs by fulfilment: *"Please have
{total} ready for the courier"* for delivery, *"Pay when you collect from
{branch}"* for pickup — confirmed both render correctly (see live test
below). Print button via `window.print()`.

### D. Account — built
`AccountLayout` guards on `user` (redirects to `/account/login`, never to
`/admin` — this is the customer-only auth surface, no `RequireStaff`
anywhere). Five sections: **Orders** (RLS-scoped list linking to
confirmation), **Profile** (edits the customer's own row; RLS's
`customers_self_update` policy itself blocks `is_blocked` changes, so I
don't need to hide that field — the database enforces it regardless),
**Addresses** (full CRUD on `customer_addresses`, default-flag checkbox;
the "only one default" invariant is a database trigger, not client logic),
**Loyalty** (balance + ledger from `loyalty_transactions`, plus a plain-language
rule explainer computed from the live `loyalty` setting, not hardcoded),
**Wishlist** (reads `wishlist_items` keyed by `user_id`, with a genuine
move-to-bag action).

**Known seam, flagged rather than hidden**: P11's product-card heart toggle
uses a local, guest-friendly `localStorage` wishlist (`useWishlist` context)
so anonymous browsing works without an account. P12's Account → Wishlist
section, per its own spec text ("`wishlist_items` keyed by `user_id`"),
reads the **real, server-side** table instead. These are two separate lists
today — toggling a heart on a product card does not appear in the Account
wishlist, and vice versa. Unifying them (e.g. syncing local hearts to
`wishlist_items` on sign-in) wasn't asked for by either package's spec and
would be a real feature decision, not a bug fix, so I left it as two
correctly-working-but-separate systems rather than quietly gluing them
together with unrequested logic.

**Move-to-bag limitation, flagged rather than hidden**: `wishlist_items` has
no size/colour granularity — it's product-level, not variant-level. "Move to
bag" picks the product's first active variant, checks its live stock, adds
it, and tells the user exactly which variant it picked via a toast
(`store.movedToBagWithVariant`) so they can go change it on the product page
if it's wrong. This is the honest option given the table's actual shape,
not a silent guess.

### Translations
Added ~95 new `store.*` keys in both `en` and `ar`.

### Gate output

- `npx tsc --noEmit` → **clean**, `TSC_EXIT=0` (three real errors caught
  during development, all fixed without casts: two duplicate-key
  compile errors — I'd redefined `store.checkout`, which already existed
  from the P11 batch, in both `en` and `ar` — removed the duplicates; and
  the same template-literal-key pattern from P8/P9 recurring twice more
  — `t(\`status.${status}\`)` in `OrdersSection.tsx` and `TrackOrderPage.tsx`
  — fixed by adding one shared `orderStatusLabel()` switch helper in
  `storefront/lib.ts` instead of two more one-off casts).
- `npm run build` → **success**, `BUILD_EXIT=0` (`✓ built in 6.23s`; only the
  pre-existing >500 kB chunk-size advisory, now larger with the full
  storefront — flagging that code-splitting the storefront/admin bundles
  would be worth doing eventually, though the spec never asked for it and I
  didn't add the dependency-free plumbing for it here).
- Grep 3 (physical-direction / `any`) → **nothing**.
- Grep 4 (toast English literals) → **nothing**.
- Grep 5 (thrown English literals, *.tsx) → same pre-existing hits as every
  prior report, **none new** (the `useCart`/`useWishlist` provider-guard
  throws were already flagged in the P11 entry and are unchanged).

### Live end-to-end verification (this package's gate explicitly requires it)
Ran the full flow in the browser tool against the live database:

1. **Pre-check via SQL** — `VT-FLEXSHORT-M-BLK` (variant
   `97f9f833-6987-475d-a315-a39a8434a8a9`) at "Main Store"
   (`9c88ba4c-ed3d-4fa4-9d04-850ac2be895f`): `quantity = 18, reserved = 0`.
2. **Added to bag as a guest**: `/product/flex-short`, selected size M,
   colour Black, clicked Add to bag. Confirmed via
   `localStorage['vitality.shop.cart']` that the correct `variant_id` was
   stored.
3. **Checked out as a guest**: `/checkout`, filled contact (Test Guest,
   01012345678), selected Pickup → Main Store, clicked Place Order.
4. **Confirmation page rendered correctly**: order number **VT-1001**,
   "Pay when you collect from Main Store", subtotal EGP 2,100, shipping
   EGP 0 (correct — pickup has no shipping charge), total EGP 2,100,
   fulfilment Pickup, branch Main Store. No console errors throughout.
5. **Verified via SQL that the order is real and admin-visible** (the exact
   row `/admin/orders` reads): `orders` table has
   `order_number = 'VT-1001'`, `channel = 'online'`, `status = 'pending'`,
   `payment_status = 'unpaid'`, `payment_method = 'cash'` (pickup → cash,
   per spec), `fulfillment = 'pickup'`, `subtotal = total = 2100.00`. A
   matching `order_items` row exists: Flex short, M / Black,
   `VT-FLEXSHORT-M-BLK`, qty 1, total 2100.00. A `notifications` row was
   also created (`type = 'new_order'`), which is what powers the admin
   notification bell.
6. **Stock behaved exactly as required — the gate's specific pass/fail
   criterion**:
   - **Before**: `quantity = 18, reserved = 0` at Main Store.
   - **After**: `quantity = 18, reserved = 1` at Main Store. The Warehouse
     location's row for the same variant (`quantity = 13, reserved = 0`)
     was untouched, confirming the reservation is location-scoped, not
     global.
   - `quantity` did **not** drop; `reserved` rose by exactly the ordered
     amount. Sellable stock at Main Store (`quantity - reserved`) dropped
     from 18 to 17, matching the ordered quantity. This is the correct
     behaviour — had `quantity` dropped instead, that would mean stock was
     wrongly deducted immediately instead of reserved, and I would be
     reporting that as a failure per the gate's explicit instruction.
7. **Cart cleared client-side** after the successful order — confirmed
   `localStorage['vitality.shop.cart']` is `"[]"` immediately after.

**I left the real test order (VT-1001, customer "Test Guest") in the live
database** rather than deleting it, since the gate explicitly asks to
confirm an order "appears in the admin under /admin/orders" — this is that
order, available for the owner to inspect directly. It also created one
real `customers` row (phone `01012345678`, unlinked to any auth user, since
the checkout was performed signed-out). I did not clean these up
unilaterally since deleting a real order and reversing its stock
reservation is a mutating action outside what I was asked to do; the owner
can delete it via `/admin/orders` (or ask me to) if they'd rather the
database stay purely as originally seeded.

### Not verified
- **Signed-in checkout path** (prefill from customer, saved addresses,
  attaching `user_id`) was not exercised live — same signup rate-limit
  blocker as every admin package this session, and it applies here too
  since testing it meaningfully requires a real signed-in customer. The
  guest path, which is the harder/more important case per the spec's own
  framing ("cash only," "never send prices"), is fully verified above.
- Account pages (Orders/Profile/Addresses/Loyalty/Wishlist) were
  code-reviewed and gate-clean but not click-tested, for the same reason.
- `/track`'s signed-in path was not exercised live for the same reason;
  its guest path (the sign-in prompt) is trivially correct by construction
  since it's a static branch on `!user`.

---

## 2026-07-29 — Full bug audit and fix pass

Scope: every file except `node_modules/` and `dist/`, plus the live Supabase
project. Full write-up in **`BUG_REPORT.md`**; summary only here.

**39 issues found, 26 fixed and verified, 13 left open with reasons.**

Six critical bugs, all fixed and proven against real data in rolled-back
transactions:

- `process_return` refunded the pre-discount price — a 20%-discounted 5,700 sale
  refunded 5,700 against 4,560 paid.
- `cancel_order` after a partial return double-restocked (20 → 22 units) and
  refunded the return a second time.
- Guest checkout let a signed-in user bind their login to any unlinked customer
  record by phone number, exposing that customer's orders and addresses.
- `process_return` would refund an order that had never been paid.
- Customers could set their own `loyalty_points` (proven: 999,999) via the REST
  API, and points redeem for cash.
- `OrderDetailPage` called a hook after an early return and rendered **blank** —
  the entire order workflow was dead.

New migrations: `0013` (money/stock integrity), `0014` (corrects the 0013
customer-column guard, which had no effect as written), `0015` (fixes an online
checkout regression `0013` introduced — an untyped `CASE` that would not cast to
the `payment_method` enum).

Tooling: ESLint added (there was none) with `rules-of-hooks` as an error. It
found the second hook-order defect in `ProductEditor` immediately.

Gates after the pass: `tsc` clean, `build` succeeds, `rules-of-hooks` 0
violations (was 20), all convention greps clean including gate 5, which had been
failing with 9 English error strings.

**Not done:** seed migration `0011` is still missing from the repo, `0008` has
drifted from the applied `0008a`–`0008d`, and discount product/category scoping
is still unimplemented. See `BUG_REPORT.md` → Remaining work.
