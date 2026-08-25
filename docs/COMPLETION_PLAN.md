# Completion plan — Vitality store

This is the sequencing document. It says **what order to work in** and **what
"done" means**. It does not restate the rules or the database contract:

- `docs/REMAINING_WORK.md` — the eleven rules and the verification gate
- `docs/BUILD_SPEC.md` — database contract, RPC signatures, RTL rules, tokens
- `docs/packages/P08…P12.md` — the per-package specifications

Read `REMAINING_WORK.md` and `BUILD_SPEC.md` before writing any code.

---

## Where the project actually stands

**Built and verified:** core libraries, 16 UI primitives, admin shell, POS,
Dashboard, Orders, Products, Inventory, Purchasing. The database is live,
migrated and seeded — 36 tables, 8 views, 64 RLS policies. Do not rebuild any
of it and do not add dependencies.

**Not started:** everything below. Seven admin pages are still `comingSoon`
placeholders and the entire storefront is a stub — `/` renders a placeholder.

Roughly 55% complete by surface area, but the hard parts (schema, auth, money
handling, POS) are behind you.

---

## Step 0 — P7 leftovers (do this first, ~20 minutes)

Found during review of the P7 corrections. All in
`src/admin/pages/PurchasingPage.tsx`.

**0.1 — Empty `variant_id` reaches the database.**
`addItem()` (~line 773) pushes `{ variant_id: '', quantity: 1, unit_cost: '0' }`.
The only guard in `saveMutation` is `items.length === 0`. Add a row, leave the
variant dropdown on its blank placeholder, press Save → `''` is sent for a uuid
column and Postgres throws `invalid input syntax for type uuid` in the user's
face. Validate that every row has a `variant_id` and a positive `quantity`, and
disable Save until they do. See rule 10.

**0.2 — PO edit deletes line items non-atomically.**
The `if (editingPO)` branch (~line 709) does `.delete()` on
`purchase_order_items` then `.insert()`. If the insert fails, the PO is left
with **zero** line items while its header still shows a total. It is currently
guarded to `status === 'draft'` only, which keeps the blast radius small — but
prefer updating rows in place, or at minimum insert first and delete the old
ids afterwards.

**0.3 — Barcode scanning cannot be tested.**
All 76 seeded variants have `barcode = null`. The stocktake barcode path is
correctly written now, but nothing can exercise it. Either seed barcodes on a
few variants so the flow is verifiable, or state plainly in your report that it
is untested. Do not claim it works.

---

## Step 1 — P8: Customers + Discounts + Staff

Spec: `docs/packages/P08-customers-discounts-staff.md`

Three independent admin pages. They share no state, so they can be built in one
pass. Highest-risk detail: `discounts.value` stores `10` to mean 10% — display
with `formatPercent(v, locale, { isWholeNumber: true })` or it renders "1,000%".

## Step 2 — P9: Reports + Cash & Shifts

Spec: `docs/packages/P09-reports-cash.md`

Cash is the module the owner uses to check nobody is stealing, so precision
matters more than polish. Note the expenses trigger: inserting an expense with
`paid_from_drawer` already writes the matching negative `cash_movements` row —
do not write it yourself or it double-counts.

## Step 3 — P10: Storefront CMS + Settings

Spec: `docs/packages/P10-cms-settings.md`

**Do this before P11/P12.** The storefront reads hero content, marquee
messages, collections and the `shipping` / `loyalty` settings from what this
package manages. Building the storefront first means building against data you
cannot yet edit.

## Step 4 — P11: Storefront browse

Spec: `docs/packages/P11-storefront-browse.md`

Match `docs/original-storefront.html` — do not invent a new visual language.
There are zero `product_images` rows, so the colour-block placeholder is the
normal case, not a fallback.

## Step 5 — P12: Storefront checkout

Spec: `docs/packages/P12-storefront-checkout.md`

The package where a customer hands over money. **Cash only — no payment
provider may be added.** Never send prices from the browser; `create_online_order`
reads every price from the database. Disable the Place Order button while the
request is in flight so a double-click cannot create two orders.

---

## Definition of done, per package

1. Every gate command in `REMAINING_WORK.md` passes — paste the real output.
2. Every RPC the package spec names has a real call site with a line number.
3. Every new string exists in both `en` and `ar`.
4. Every list has a loading skeleton and an empty state. The database is nearly
   empty, so empty states are the normal case.
5. No inert controls. If you could not finish something, leave it visibly
   disabled and say so.
6. Your report names anything unfinished, plainly.

## Working protocol

**One package per session.** Finish it, run the gates, report, stop. Do not
start the next package in the same session.

Between packages the work is reviewed against the real files — greps for the
named RPC call sites, a read of the actual components, and checks against the
live database schema. Three separate times on this project a feature was
reported done while the call site did not exist. Assume it will be checked.

When something in a spec is wrong or impossible, say so instead of inventing a
workaround. Do not add database functions, loosen RLS, or add dependencies to
make a spec easier.
