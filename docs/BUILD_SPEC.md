# Vitality — Build Spec

Authoritative reference for everyone working on this repo. **If this document
and your intuition disagree, this document wins.** Do not invent table names,
column names, or RPC signatures — they are all listed here and in
`src/lib/database.types.ts`, which is generated from the live database.

---

## 1. What this is

A clothing store that operates **both a physical shop and an online store**.
One React app serves two audiences:

| Route prefix | Audience | Notes |
|---|---|---|
| `/` | Customers | Public storefront |
| `/admin/*` | Shop staff | Admin dashboard, auth required |

**Cash only.** There is no card processor, no Stripe, no payment gateway, and
none may be added. Money moves in exactly two ways:
- `payment_method = 'cash'` — paid at the counter (POS) or on pickup
- `payment_method = 'cash_on_delivery'` — collected by the courier

---

## 2. Stack (already installed — do not add dependencies without asking)

React 19 · Vite 6 · TypeScript 5.7 · Tailwind CSS v4 (`@tailwindcss/vite`) ·
React Router 7 · `@supabase/supabase-js` 2 · `@tanstack/react-query` 5 ·
Recharts 2 · lucide-react · date-fns · sonner · clsx · tailwind-merge

Tailwind v4 is configured **in CSS**, not `tailwind.config.js`. Use
`@import "tailwindcss";` and `@theme { ... }` in `src/index.css`.

Path alias `@/` → `src/`.

---

## 3. Live database

Already created, migrated and seeded. Credentials are in `.env`.

- URL `https://xsfpfukhuvsurtfqbhup.supabase.co`
- 36 tables, 8 views, RLS on every table
- Seeded: 2 locations, 4 categories, 1 brand, 8 products, 76 variants,
  ~2199 units of stock, 2 discount codes, 6 settings rows, CMS content

### 3.1 Tables you will use most

`products` · `product_variants` · `product_images` · `categories` · `brands` ·
`collections` · `locations` · `inventory_levels` · `inventory_movements` ·
`orders` · `order_items` · `order_events` · `customers` · `customer_addresses` ·
`discounts` · `shifts` · `cash_movements` · `expenses` · `returns` ·
`suppliers` · `purchase_orders` · `profiles` · `settings` · `content_blocks` ·
`marquee_messages` · `notifications` · `reviews` · `audit_log`

### 3.2 Bilingual columns

Content tables carry **both** languages as separate columns:
`name_en` / `name_ar`, `description_en` / `description_ar`,
`title_en` / `title_ar`, `text_en` / `text_ar`.

Always pick the column by the active locale. Never show a raw `_en` value to an
Arabic user just because `_ar` is empty — fall back explicitly.

### 3.3 Money

All money columns are `numeric(12,2)` and **arrive from PostgREST as strings**
(e.g. `"1900.00"`). Always `Number(...)` before doing arithmetic. Currency is
**EGP**. Never hardcode `$`.

### 3.4 Views (read-only, already RLS-aware)

| View | Use for |
|---|---|
| `v_storefront_products` | The public catalogue. Has `sizes[]`, `colors[]`, `primary_image`, `available_stock` |
| `v_variant_stock` | Per-variant stock rolled up across locations |
| `v_low_stock` | Anything at/below its reorder point |
| `v_inventory_valuation` | Stock value at cost and at retail, per location |
| `v_daily_sales` | Daily revenue by channel — the dashboard chart |
| `v_product_performance` | Units, revenue, cost, **profit** per product |
| `v_sales_by_hour` | `day_of_week` × `hour_of_day` heatmap |
| `v_staff_sales` | Sales per cashier per day |

### 3.5 RPCs — the ONLY way to touch money or stock

Never `insert` into `orders` / `order_items` / `inventory_levels` directly.
Call these via `supabase.rpc(...)`:

```ts
// Counter sale. Deducts stock immediately, puts cash in the drawer.
create_pos_sale({
  p_location_id: string,
  p_items: Array<{ variant_id: string; quantity: number; unit_price?: number; discount?: number }>,
  p_shift_id?: string | null,
  p_customer_id?: string | null,
  p_discount_code?: string | null,
  p_manual_discount?: number,
  p_amount_tendered?: number | null,
  p_notes?: string | null,
}) // -> orders row

// Guest/online checkout. Callable by anon. RESERVES stock, does not deduct.
create_online_order({
  p_items: Array<{ variant_id: string; quantity: number }>,
  p_contact_name: string,
  p_contact_phone: string,
  p_fulfillment?: 'delivery' | 'pickup' | 'in_store',
  p_contact_email?: string | null,
  p_address?: object | null,       // required when fulfillment = 'delivery'
  p_discount_code?: string | null,
  p_notes?: string | null,
  p_location_id?: string | null,
}) // -> orders row

complete_order({ p_order_id, p_shift_id? })   // reservation -> real deduction, marks paid
cancel_order({ p_order_id, p_reason? })        // releases or restocks, refunds drawer
process_return({ p_order_id, p_lines: Array<{order_item_id, quantity, restock}>, p_reason?, p_shift_id? })
validate_discount({ p_code, p_subtotal, p_customer_id? })  // -> { valid, amount, reason }
adjust_stock({ p_variant_id, p_location_id, p_delta, p_reason?, p_note? })
set_stock({ p_variant_id, p_location_id, p_counted, p_note? })   // stocktake
open_shift({ p_location_id, p_opening_float })
close_shift({ p_shift_id, p_counted_cash, p_notes? })
shift_expected_cash({ p_shift_id })
record_cash_movement({ p_shift_id, p_type: 'pay_in'|'pay_out', p_amount, p_reason? })
receive_purchase_order({ p_po_id, p_lines })
complete_stock_transfer({ p_transfer_id })
redeem_points({ p_customer_id, p_points })
get_setting({ p_key, p_default? })
```

RPC errors surface as `error.message` with a human-readable sentence
("Only 3 left of Field jacket (M / Black)"). Show it to the user verbatim.

### 3.6 Stock model — important

- **POS sale** → stock leaves immediately (`inventory_levels.quantity` drops).
- **Online order** → stock is *reserved* (`reserved` goes up, `quantity`
  unchanged). It only really leaves when `complete_order` runs.
- **Sellable quantity is always `quantity - reserved`**, never `quantity`.

### 3.7 Roles

`profiles.role` ∈ `owner` · `manager` · `cashier` · `stock` · `viewer` · `customer`

The **first person who ever signs up automatically becomes `owner`**. Everyone
after that is a `customer` until an owner/manager promotes them.

| Capability | owner | manager | cashier | stock | viewer |
|---|---|---|---|---|---|
| POS / take sales | ✓ | ✓ | ✓ | — | — |
| Orders, customers | ✓ | ✓ | ✓ | ✓ | read |
| Products, stock | ✓ | ✓ | — | ✓ | read |
| Prices, discounts, settings, staff | ✓ | ✓ | — | — | — |
| Reports, audit log | ✓ | ✓ | — | — | read |

Hide what a role cannot do; the database enforces it regardless.

---

## 4. Visual identity

Carried over from the original storefront (`docs/original-storefront.html`).
The admin should feel like the same brand — quiet, high-contrast, editorial.

```
--ink:   #111110   near-black, primary text + dark surfaces
--bone:  #F6F6F4   off-white page background
--moss:  #4A4A47   muted grey-green, secondary text
--ember: #1A1A18   near-black accent
--sand:  #D9D8D3   warm light grey, borders + fills
```

Semantic additions (new, keep them muted to match):
`success #5C7A5C` · `warning #B0873A` · `danger #C1442C` · `info #4A6070`

**Type**
- Display / headings: `Anton`, uppercase, `line-height: 0.9`
- Body / UI (Latin): `Space Grotesk`
- Body / UI (Arabic): `IBM Plex Sans Arabic` — Anton has no Arabic glyphs, so
  Arabic headings must fall back to IBM Plex Sans Arabic at weight 700.

All three are already loaded in `index.html`.

**Shape**: generous radii (cards ~18px, pills 100px), 1px `--sand` borders,
almost no drop shadows. Buttons are pill-shaped.

---

## 5. Arabic / RTL — non-negotiable rules

Arabic is the **default** locale. The whole admin and storefront must work in
both directions.

- Set `document.documentElement.lang` and `dir` on locale change; persist to
  `localStorage` under `vitality.locale`.
- **Never** use a physical-direction class. The full banned list:

  | Banned | Use instead |
  |---|---|
  | `ml-* mr-*` | `ms-* me-*` |
  | `pl-* pr-*` | `ps-* pe-*` |
  | `left-* right-*` | `start-* end-*` |
  | `text-left text-right` | `text-start text-end` |
  | `border-l border-r` | `border-s border-e` |
  | `rounded-l-* rounded-r-*` | `rounded-s-* rounded-e-*` |
  | `float-left float-right` | `float-start float-end` |
  | `origin-left origin-right` | `origin-start origin-end` |

- `inset-block-*`, `inset-inline-start-*` and `inset-inline-end-*` are **not
  Tailwind class names** — they are raw CSS properties. Tailwind's equivalents
  are `inset-y-*`, `start-*` and `end-*`. Writing the CSS property name as a
  class produces a silent no-op, which is how RTL bugs hide.
- A `position:relative` child inside a `display:flex` parent ignores `start-*` /
  `end-*` entirely. To pin a panel to one edge, either position it absolutely
  against a non-flex parent, or control the edge with flex alignment
  (`justify-start` / `justify-end`, which are already logical).
- `aria-label`, `alt` and `title` are read aloud to users — they must be
  translated like any other visible string. Never hardcode English in them.
- Directional icons (chevrons, arrows) must flip in RTL.
- Numbers, money, SKUs and phone numbers stay LTR — wrap them in
  `dir="ltr"` where they sit inside Arabic text.
- Charts: flip axis orientation in RTL.

---

## 6. File layout

```
src/
  main.tsx                 app entry, providers, router
  index.css                Tailwind v4 + @theme tokens + font faces
  lib/
    database.types.ts      GENERATED — never edit
    supabase.ts            typed client + isSupabaseConfigured
    env.ts                 parsed import.meta.env
    money.ts               EGP formatting, numeric() coercion
    i18n.tsx               LocaleProvider, useT(), useLocale(), dir handling
    auth.tsx               AuthProvider, useAuth(), useCan()
    query.ts               QueryClient config
    utils.ts               cn(), slugify, date helpers
  components/ui/           Button, Input, Select, Card, Table, Modal, Badge,
                           Drawer, Tabs, EmptyState, Spinner, Pagination...
  admin/
    AdminLayout.tsx        sidebar + topbar shell
    pages/                 one folder per module
  storefront/
    StoreLayout.tsx
    pages/
```

---

## 7. Conventions

- **Data fetching**: React Query only. Query keys are arrays starting with the
  entity: `['products', filters]`. Mutations must `invalidateQueries` for every
  affected entity — a POS sale invalidates `orders`, `inventory`, `shifts`,
  `dashboard`.
- **Toasts**: `sonner`. Success on every mutation, and the raw `error.message`
  on failure. **The success text must come from `t()`** — a string literal like
  `toast.success('Order completed')` is a bilingual bug, not a detail. This has
  been missed repeatedly; grep your own work for
  `toast\.(success|error|info)\(\s*['"][A-Za-z]` before reporting.
- **Loading**: skeletons, not spinners, for lists and cards.
- **Empty states**: every list needs one — icon, one line of explanation, and
  the primary action.
- **Forms**: plain controlled React state. No form library.
- **Money display**: always through the `money.ts` helper. Never
  `` `${x} EGP` `` inline.
- **Dates**: `date-fns`, with the Arabic locale when `locale === 'ar'`.
- **Accessibility**: real `<button>`/`<label>`, visible focus rings, modals
  close on Escape and trap focus.
- **TypeScript**: no `any`. Derive row types from `database.types.ts`, e.g.
  `type Product = Database['public']['Tables']['products']['Row']`.

## 8. Definition of done for every package

1. `npx tsc --noEmit` passes with zero errors.
2. `npm run build` succeeds.
3. Every string visible to a user exists in **both** `en` and `ar`.
4. No `ml-/mr-/pl-/pr-/left-/right-` classes anywhere.
5. No hardcoded `$`, and no invented table/column/RPC names.
