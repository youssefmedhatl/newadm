# Vitality — staff admin dashboard

The back office, simplified down to what a single-branch shop actually
needs: **Dashboard, Orders, History, POS, Products, Discounts**. This is
one half of a two-app split — the other half, `vitality-customer`, is the
public storefront. They are **fully independent apps** that both talk to
the **same Supabase project**.

Cash only by design — there is no card processor. Money moves two ways:
`cash` (paid at the counter or on pickup) and `cash_on_delivery` (collected
by the courier).

## What changed from the full build

- **No branch picker anywhere.** The shop runs one location; POS picks it
  automatically in the background.
- **POS has no open/close-shift step.** A shift stays open automatically
  behind the scenes so sales can be recorded — cashiers just click items
  and take payment, like a normal till.
- **Stock lives on the product itself.** Each variant in the Product Editor
  now has a plain "Stock" number field instead of a separate Inventory page.
  It still writes through the same audited stock-adjustment function the
  old Inventory page used, just without any of that page's multi-location
  complexity.
- **Orders vs. History.** Orders now shows only the active/pending queue.
  Completed and cancelled orders moved to the new History tab so the active
  list doesn't fill up with finished business.
- **Inventory, Purchasing, Customers, Reports, Cash, Staff, Storefront/CMS,
  and Settings are hidden, not deleted.** Every one of those page files,
  routes, and permissions is still in the project — they're just not linked
  in the sidebar. To bring one back: open `src/App.tsx`, uncomment its
  lazy-import line and its `<Route>` entry, then open
  `src/admin/AdminLayout.tsx` and uncomment its line in `NAV_ITEMS`.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5174 (a different port than the customer app, so
you can run both at once)

You'll land on the sign-in screen. **The first account that ever signs up
becomes `owner`** with full access.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload (port 5174) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally (port 4174) |
| `npm run typecheck` | TypeScript check, no emit — **run this before trusting anything "looks fine"**. `npm run build` does *not* typecheck, it just transpiles — a broken type can still "build" successfully. |
| `npm run lint` | ESLint |

If `npm install` complains about peer dependencies, use:
```bash
npm install --legacy-peer-deps
```

---

## The database is already connected

`.env` already points at the live Supabase project. Nothing else to
configure:

```
VITE_SUPABASE_URL=https://xsfpfukhuvsurtfqbhup.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

This app and `vitality-customer` share the exact same database — an order
placed on the storefront shows up here in Orders immediately, and a product
you publish here shows up there.

### Pointing at a different Supabase project

1. Create the project.
2. Run every file in `supabase/migrations/` **in filename order** in the SQL
   editor. They're written to be safe to re-run. `0011_seed.sql` is the
   catalogue/config seed — it inserts no customers, orders, or cash.
3. Update the two values in `.env` (in **both** this app and
   `vitality-customer` — they need to point at the same project).

`supabase/migrations/PENDING_0031_drop_cost_columns.sql.txt` is **not** a
migration on purpose (the `.txt` stops it from being picked up). Read it
before deciding whether to apply it.

---

## What's in here

- `src/admin/` — every staff-facing page and the dashboard shell/nav
- `src/lib/` — Supabase client, auth, i18n (EN/AR with RTL), money
  formatting, shared query setup
- `src/components/` — shared UI primitives (buttons, inputs, etc.)
- `docs/` — the build/security/QA history for this project — useful context
  on what's been verified vs. still-open, kept here since it's mostly about
  backend and ops
- `supabase/migrations/` — every SQL migration, in order

All internal admin navigation still uses the `/admin/...` path prefix
internally (e.g. `/admin/orders`, `/admin/products/:id`) even though this is
now its own app running at the root — that prefix is hardcoded across many
admin pages, so it was left as-is rather than risk breaking a link by
renaming it everywhere. Visiting `/` just redirects you to `/admin`.

There is no storefront code in this project at all — it was intentionally
removed. If you need the customer-facing shop, that's the separate
`vitality-customer` app.

