# Remaining work — read this first

> **Status corrected 2026-07-29.** This table said P8–P12 were "not started",
> which was stale — `PROGRESS.md` has completed sections for all of them. All
> twelve packages are built. What is actually left is in
> **`BUG_REPORT.md` → Remaining work**, not here.

| # | Package | File | Status |
|---|---|---|---|
| P7 | Finish Inventory + Purchasing | `packages/P07-inventory-completion.md` | **DONE** |
| P8 | Customers + Discounts + Staff | `packages/P08-customers-discounts-staff.md` | **DONE** |
| P9 | Reports + Cash & Shifts | `packages/P09-reports-cash.md` | **DONE** |
| P10 | Storefront CMS + Settings | `packages/P10-cms-settings.md` | **DONE** |
| P11 | Storefront: shell, home, catalog, product page | `packages/P11-storefront-browse.md` | **DONE** |
| P12 | Storefront: cart, checkout, tracking, account | `packages/P12-storefront-checkout.md` | **DONE** |

A full bug audit followed on 2026-07-29 and fixed 26 issues, including six
critical ones in the money and stock paths. Read **`BUG_REPORT.md`** before
touching `process_return`, `cancel_order`, `create_pos_sale` or
`create_online_order` — their contracts changed (migrations `0013`–`0015`).

The highest-priority outstanding item is that **seed migration `0011` is missing
from the repo**, so a rebuild from `supabase/migrations/` produces an empty
store. Details in `BUG_REPORT.md` S2-01.

Before touching any of them, read `docs/BUILD_SPEC.md` in full. It is the
authoritative reference for the database contract, the design tokens, the RTL
rules, and the conventions. If this document and your instinct disagree, this
document wins.

---

## What already exists — do NOT rebuild it

- **Database** — live, migrated, seeded. 36 tables, 8 views, 64 RLS policies.
  Credentials are in `.env`. Never edit `supabase/` or `src/lib/database.types.ts`.
- **`src/lib/`** — `supabase.ts` (typed client + `Tables<>`/`Enums<>`/`Views<>`),
  `auth.tsx` (`useAuth`, `useCan`, `RequireStaff`), `i18n.tsx` (`useT`,
  `useLocale`, `useLocalized`), `money.ts` (`num`, `formatMoney`,
  `formatNumber`, `formatPercent`), `utils.ts` (`cn`, `slugify`),
  `translations.ts`.
- **`src/components/ui/`** — 16 primitives: `Button, Input, Textarea, Select,
  Card, Badge, Table, Modal, Drawer, Tabs, EmptyState, Skeleton, Spinner,
  SearchInput, Pagination, ConfirmDialog`, plus `useFocusTrap`.
  **Use these. Do not write raw `<input>`/`<button>` and do not add primitives.**
- **`src/admin/`** — `AdminLayout` (sidebar, 13 permission-gated nav items,
  notification bell, language toggle), and these working modules: POS
  (`pos/`, `pages/POSPage.tsx`), Dashboard (`dashboard/`,
  `pages/DashboardPage.tsx`), Orders (`pages/OrdersPage.tsx`,
  `pages/OrderDetailPage.tsx`), Products (`products/ProductEditor.tsx`,
  `pages/ProductsPage.tsx`), and part of Inventory/Purchasing.

Dependencies are installed. **Add none.**

---

## The eleven rules

These are not style preferences. Every one of them is a real defect that
already happened on this project and had to be sent back.

### 1. Never put a conditional `return` above your hooks
```tsx
// WRONG — crashes on every page load
if (!can('orders')) return <NotAuthorised />
const [x, setX] = useState('')

// RIGHT — guard goes below every hook
const [x, setX] = useState('')
...all other hooks...
if (!can('orders')) return <NotAuthorised />
```
`role` is `null` while auth loads, then becomes real. A guard above the hooks
changes the hook count between renders and React throws *"Rendered more hooks
than during the previous render"*. This crashed the POS on every single load.

### 2. `any` is banned in every form
`: any`, `as any`, `<any>`, `useState<any>`. Derive types from
`src/lib/database.types.ts` through the helpers in `src/lib/supabase.ts`. If you
reach for `as any` on a `.eq()` call, the real fix is to type the state as the
enum: `useState<Enums<'order_status'> | ''>('')`.

### 3. Every user-visible string goes through `t()`, in BOTH `en` and `ar`
Including `aria-label`, `placeholder`, `title`, `alt` — and **toast messages**.
`toast.success('Saved')` is a bilingual bug. Six of these shipped before anyone
noticed. Write natural Arabic, not transliteration.

### 4. No physical-direction classes
Banned: `ml-* mr-* pl-* pr-* left-* right-* text-left text-right border-l
border-r rounded-l-* rounded-r-* float-left float-right origin-left
origin-right`.
Use: `ms-* me-* ps-* pe-* start-* end-* text-start text-end border-s border-e
rounded-s-* rounded-e-* float-start float-end`.

`inset-inline-start-*`, `inset-inline-end-*` and `inset-block-*` are **NOT
Tailwind class names** — they are raw CSS property names and Tailwind emits
nothing for them. This silently broke the Drawer in both languages. Tailwind's
equivalents are `start-*`, `end-*`, `inset-y-*`.

Also: a `position:relative` child inside a `display:flex` parent ignores
`start-*`/`end-*` entirely. Pin panels with `justify-start`/`justify-end`, which
are already logical.

### 5. Money is a STRING coming out of the database
`numeric` columns arrive as `"1900.00"`. Always `num()` before arithmetic,
always `formatMoney()` to display. Never hardcode `$` or `EGP`.
Note `discounts.value` stores `10` to mean 10% — pass
`formatPercent(v, locale, { isWholeNumber: true })` or it renders "1,000%".

### 6. Money and stock go through RPCs, never direct writes
Never `insert` into `orders`/`order_items`, never `update`
`inventory_levels.quantity`. Use the functions listed in BUILD_SPEC §3.5. The
rules live in the database so they cannot be bypassed. Surface `error.message`
verbatim in a toast — the database returns readable sentences.

Sellable stock is **always `quantity - reserved`**, never `quantity`.

### 7. Never ship an inert control
A drop-zone with no file input. A "Receive" button wired to nothing. These are
worse than an obviously missing feature, because they are indistinguishable
from working software and a shop owner will trust them. If you cannot finish
something, leave it visibly disabled with an explanation, and **say so in your
report**.

### 8. A thrown literal is a user-visible string
```tsx
// WRONG — displays English to an Arabic user
if (!x) throw new Error('Variant not found')
// ...because every onError does:
onError: (e) => toast.error(e.message)
```
Six of these shipped in P7 while the toast grep returned clean. Anything thrown
from a `mutationFn` reaches the user. Route it through `t()`. Never concatenate
either — `t('inventory.adjustDelta') + ' required'` renders as
"تغيير الكمية required".

### 9. Write EVERY NOT NULL column, not just the one you display
`purchase_orders` has `subtotal`, `shipping_cost` **and** `total`, all
`NOT NULL DEFAULT 0`. P7 wrote only `total`, so every PO silently stored
`subtotal = 0` and the insert succeeded. Postgres will not warn you. Before
inserting, list the table's columns and account for each one.

### 10. Validate before the value reaches the database
A `Select` whose placeholder is `value=""` will send `""` for a uuid column and
produce a raw Postgres error in the user's face. Check that every required
field on every row is filled before you call `.insert()`, and disable the save
button until it is.

Related: a `delete()` followed by an `insert()` is **not atomic** over
PostgREST. If the insert fails, the rows are gone. Prefer updating rows in
place, or accept the risk only where the blast radius is provably tiny — and
say so in your report.

### 11. Report honestly
- Do not claim a check passed unless you ran it and read the output.
- Do not attribute your own omission to the spec.
- Do not call an unfinished thing "infrastructure in place" or "integration
  pending".
- "I did not finish X because Y" is a good, useful answer. Say that instead.

---

## Verification gate — run before declaring ANY package done

All four, from `C:\Users\Shiko\Downloads\clinic\claude\vitality-store`. Paste
the real output of each into your report.

```powershell
npx tsc --noEmit
```
```powershell
npm run build
```
```powershell
Get-ChildItem -Recurse src -Include *.ts,*.tsx,*.css | Where-Object { $_.Name -ne 'database.types.ts' } | Select-String -Pattern "\bml-|\bmr-|\bpl-|\bpr-|text-left|text-right|border-l\b|border-r\b|rounded-l-|rounded-r-|inset-block|inset-inline|: any\b|as any|<any>"
```
```powershell
Get-ChildItem -Recurse src -Include *.ts,*.tsx | Select-String -Pattern "toast\.(success|error|info)\(\s*['`"][A-Za-z]"
```
```powershell
Get-ChildItem -Recurse src -Include *.tsx | Select-String -Pattern "throw new Error\(\s*['`"][A-Za-z]"
```

The first two must exit clean. The last three must return **nothing**.

That fourth grep exists because the third one has a blind spot. A literal
thrown inside a `mutationFn` reaches the user just the same, because every
`onError` does `toast.error(error.message)`. Six English strings shipped this
way in P7 while the toast grep returned clean. If a thrown message is only ever
read by you and never surfaced, say so in your report rather than leaving it.

Then, for any package that claims to call a database function, prove it:
```powershell
Get-ChildItem -Recurse src -Include *.tsx | Select-String -Pattern "rpc\('"
```
Every RPC the package spec named must appear with a line number. This is how a
missing feature gets caught — three were mislabeled as done on this project
because nobody grepped for the call site.

---

## Definition of done, per package

1. All gate commands clean.
2. Every RPC named in the package spec has a real call site.
3. Every new string exists in both `en` and `ar`.
4. Every list has a loading skeleton and an empty state — the database is nearly
   empty, so empty states are the normal case, not an edge case.
5. No inert controls.
6. Your report names anything unfinished, plainly.
