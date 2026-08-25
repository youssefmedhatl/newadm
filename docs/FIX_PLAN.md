# Vitality — execution plan for the 21 outstanding items

**Author:** Opus 5 (audit + security review, 2026-07-29)
**Audience:** the implementing model. **You did not perform the audit.** Everything
you need is in this document plus `docs/BUG_REPORT.md` and
`docs/SECURITY_REVIEW.md`.
**Your job:** apply the changes. **Do not test, do not verify, do not prove
anything.** The author will review and verify all of it afterwards. Spend your
effort on applying each change exactly as specified.

---

## 0. Read this section fully before touching anything

### 0.1 What is already done — do not redo it

Migrations `0013`–`0018` are **already applied** to the live database and already
exist on disk. They fixed 6 critical bugs, 9 high bugs and 14 security findings.
Do not re-apply, re-edit or "improve" them.

### 0.2 Environment facts

| Fact | Value |
|---|---|
| Project root | `C:\Users\Shiko\Downloads\clinic\claude\vitality-store` |
| Supabase project ref | `xsfpfukhuvsurtfqbhup` (project name "vitaly") |
| Live DB access | Yes — you have it, same as the author |
| Next free migration number | **0019** |
| Stack | React 19, Vite 6, TypeScript, Tailwind 4, Supabase, TanStack Query, react-router 7 |
| Default locale | Arabic (RTL). English is secondary. |

Use the Supabase MCP tools: `apply_migration` for DDL/functions (it is
transactional — a syntax error rolls the whole thing back), `execute_sql` for
reads, `generate_typescript_types` for regenerating types.

### 0.3 Hard rules

1. **Never edit migrations `0001`–`0018`.** One exception, explicitly authorised
   in step 1.2 below.
2. **Never hand-edit `src/lib/database.types.ts`.** Regenerate it with the MCP
   `generate_typescript_types` tool and overwrite the file wholesale.
3. **Every new migration gets a file on disk AND is applied**, with identical
   content. A migration applied without a file on disk is exactly the bug that
   broke this project's rebuild path (see `BUG_REPORT.md` S2-01).
4. **Never call a React hook after an early `return`.** This blanked an entire
   page in this codebase. All `useState`/`useEffect`/`useMemo`/`useCallback`/
   `useQuery`/`useMutation` calls go above every conditional return.
5. **Never use physical direction CSS classes** (`ml-`, `pr-`, `left-`,
   `text-left`, `border-l`). Use logical ones (`ms-`, `pe-`, `start-`,
   `text-start`, `border-s`). Arabic RTL breaks otherwise.
6. **No user-facing English string literals.** Every message goes through
   `t('key')` with entries added to **both** `en` and `ar` in
   `src/lib/translations.ts`.
7. **No `any`.** The codebase is clean of it; keep it that way.
8. **If reality does not match this plan — stop and record it.** Example: a
   function body differs from what is described here. Do not guess. Write it in
   the handback log (section 8) and move to the next step.

### 0.4 Traps that already cost this project real bugs

Read these. Each one is a mistake that actually happened here.

1. **`supabase/migrations/0008_business_logic.sql` on disk does NOT match the
   database.** The DB has it as four applied migrations `0008a`–`0008d`. The
   consolidated on-disk file has drifted and contains a genuine bug. **Never
   copy function bodies from that file.** Always fetch the live definition:
   ```sql
   select pg_get_functiondef(oid) from pg_proc
   where proname = 'create_pos_sale' and pronamespace = 'public'::regnamespace;
   ```
2. **`SECURITY DEFINER` changes `current_user`.** Inside a `SECURITY DEFINER`
   function, `current_user` is the function *owner*, not the caller. A guard that
   needs to know "did this come from the API?" must use **invoker rights** (omit
   `security definer`). This silently disabled a security fix here.
3. **Untyped `CASE` will not cast to an enum.** This broke online checkout:
   ```sql
   -- BROKEN: resolves to text, no implicit cast to the enum
   case when x then 'cash' else 'cash_on_delivery' end
   -- CORRECT: assign to a typed variable first, or cast explicitly
   declare pay_method public.payment_method;
   pay_method := (case when x then 'cash' else 'cash_on_delivery' end)::public.payment_method;
   ```
4. **PostgREST `.select('*')` fails when any column is revoked.** `SELECT *`
   needs privileges on every column. If you revoke a column, every `select('*')`
   on that table must first become an explicit column list.
5. **RLS cannot restrict columns.** Only `GRANT`/`REVOKE` on columns can. This is
   why Phase 2 exists.
6. **New views must be created with `security_invoker = true`**, otherwise they
   run as owner and bypass RLS entirely:
   ```sql
   create or replace view public.v_example with (security_invoker = true) as ...
   ```
7. **React state updaters run during render.** Do not set a flag inside a
   `setState(prev => ...)` callback and read it on the next line — it will still
   be stale. Use a ref.
8. **`settings.is_public` now defaults to `false`.** Any new setting the
   storefront must read needs `is_public = true` set explicitly.
9. **Storage bucket `product-images` now rejects SVG** and caps files at 10 MB.

### 0.5 Decisions already made by the owner — do not revisit

| Decision | Chosen |
|---|---|
| Seed file contents | Current live data, **excluding** test/transactional junk |
| Error messages | **Full** error-code system, everything translated |
| Loyalty on delivery fees | **Stop** awarding points on shipping |
| Reviews | **Require a completed purchase** before reviewing |
| "First signup becomes owner" | **Remove** it |
| Discount scoping | **Scope to eligible items**, and the minimum-spend test counts **eligible items only** |
| Product cost privacy | **Move cost into its own protected table** (not a staff-gated view) |

### 0.6 Not your work — the owner is doing these

1. Enable leaked-password protection in the Supabase dashboard.
2. Enable email confirmation in the Supabase dashboard.
3. Decide whether to clear test orders `VT-1001` / `VT-1002` and the test
   customer with phone `01012345678`. **Do not delete any rows.**

---

## 1. Phase 1 — Restore the rebuild path

**Why first:** right now the repository cannot rebuild the database. Everything
else is less urgent than that.

### Step 1.1 — Create the missing seed migration `0011_seed.sql`

The live DB has `0011a_seed_settings_and_structure` and `0011b_seed_products`
applied, but **no file exists**. Create
`supabase/migrations/0011_seed.sql`. **Do not apply it** — it is already applied
under the two names above. This file exists so a future rebuild works.

**Include these tables, in this exact order** (FK dependencies):

```
settings, locations, categories, brands, suppliers,
products, product_variants, product_images,
inventory_levels,
discounts,
collections, collection_products,
content_blocks, marquee_messages
```

**Exclude entirely** (transactional / user data / auth-linked):
`profiles`, `customers`, `customer_addresses`, `orders`, `order_items`,
`order_events`, `returns`, `return_items`, `shifts`, `cash_movements`,
`expenses`, `inventory_movements`, `loyalty_transactions`, `notifications`,
`audit_log`, `reviews`, `newsletter_subscribers`, `wishlist_items`,
`purchase_orders`, `purchase_order_items`, `stock_transfers`,
`stock_transfer_items`.

**How to generate the content.** For each table above, run a generator query and
paste its output into the file. Template — substitute the table name:

```sql
select string_agg(
  format('insert into public.%I (%s) values (%s) on conflict (id) do nothing;',
         'locations',
         (select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
            from information_schema.columns
           where table_schema='public' and table_name='locations'),
         (select string_agg(quote_nullable(v), ', ')
            from json_each_text(row_to_json(t)) as x(k, v))
  ), E'\n')
from public.locations t;
```

Notes:
- `settings` has a text primary key: use `on conflict (key) do nothing`.
- `collection_products` has a composite key: use `on conflict do nothing`.
- `inventory_levels` — insert the rows directly (with `quantity`, `reserved`,
  `reorder_point`). This intentionally seeds stock **without** writing
  `inventory_movements` history; a fresh install starts with a clean ledger.
  Add a comment in the file saying exactly that.
- Order the file's sections as listed above.

**File header** — put this at the top verbatim:

```sql
-- ===========================================================================
-- 0011_seed.sql
--
-- RECONSTRUCTED 2026-07-29. The original seed was applied to the live project
-- as 0011a_seed_settings_and_structure and 0011b_seed_products, but the file
-- was never committed, so a rebuild from this folder produced an empty store.
-- This file was regenerated from live data and is idempotent.
--
-- Catalogue and configuration only. No customers, orders, cash, or history.
-- inventory_levels rows are seeded directly, so a fresh install begins with
-- stock on hand and an empty inventory_movements ledger.
-- ===========================================================================
```

### Step 1.2 — Fix the drifted `0008_business_logic.sql` (the one authorised edit)

Open `supabase/migrations/0008_business_logic.sql`, find `create_online_order`,
and fix the enum cast described in trap 0.4.3.

- Add to the `declare` block: `pay_method  public.payment_method;`
- Immediately before the `insert into public.orders (` statement, add:
  ```sql
  pay_method := (case when p_fulfillment = 'pickup' then 'cash'
                      else 'cash_on_delivery' end)::public.payment_method;
  ```
- In that INSERT's `values` list, replace the inline
  `case when p_fulfillment = 'pickup' then 'cash' else 'cash_on_delivery' end`
  with `pay_method`.

Then add this note directly under the file's existing header comment:

```sql
-- NOTE: this file is a consolidation of what the live project has applied as
-- 0008a_helpers_and_rollups, 0008b_create_pos_sale, 0008c_create_online_order
-- and 0008d_lifecycle_returns_grants. Several functions defined here were later
-- replaced by 0013 and 0015 — those are authoritative. Do not assume this file
-- reflects the current database.
```

**Do not apply this file.** It is history repair only.

### Step 1.3 — Regenerate `database.types.ts`

`product_name_ar` was hand-added to that file, which is forbidden. Call the MCP
`generate_typescript_types` tool for project `xsfpfukhuvsurtfqbhup` and
**overwrite** `src/lib/database.types.ts` with the result.

You will regenerate this again at the end of Phase 2 and once more in Phase 7.

---

## 2. Phase 2 — Move product cost into a protected table  ⚠ HIGHEST RISK

**Problem:** `products.cost_price` and `product_variants.cost_price` are readable
by any signed-in user. Staff and customers share the `authenticated` role, so
column grants cannot separate them. Anyone who registers can read your buying
prices and margins.

**Owner's chosen approach:** physically separate cost into its own tables with
their own access rules.

**Sequencing matters.** Do the steps in order. Do **not** drop the old columns —
that is deliberately deferred to Phase 7 after review.

### Step 2.1 — Migration `0019_product_cost_tables.sql`

Two deliberately simple tables rather than one clever one:

```sql
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
```

### Step 2.2 — Migration `0020_cost_readers.sql`

Everything that reads cost must read the new tables.

**a) Three views.** Fetch each current definition first
(`select pg_get_viewdef('public.v_variant_stock'::regclass, true);`), then
recreate it with `with (security_invoker = true)`, replacing the cost source:

| View | Replace | With |
|---|---|---|
| `v_variant_stock` | `COALESCE(v.cost_price, p.cost_price)` | `COALESCE(vc.cost_price, pc.cost_price)` |
| `v_inventory_valuation` | its `cost_price` references | the joined cost tables |
| `v_product_performance` | its `cost` computation | the joined cost tables |

Add to each: `left join public.variant_costs vc on vc.variant_id = v.id` and
`left join public.product_costs pc on pc.product_id = p.id` (adjust aliases to
match the real definition).

After recreating, re-apply the grants the security review established:
```sql
revoke all on public.v_variant_stock from anon;
revoke all on public.v_inventory_valuation from anon;
revoke all on public.v_product_performance from anon;
grant select on public.v_variant_stock to authenticated;
grant select on public.v_inventory_valuation to authenticated;
grant select on public.v_product_performance to authenticated;
```

**b) Two functions.** `create_pos_sale` and `create_online_order` currently read
cost as `coalesce(v.cost_price, prod.cost_price, 0)`.

Fetch each **live** definition (trap 0.4.1 — not from the 0008 file), change
**only** the cost lookup, and re-apply the whole function unchanged otherwise:

```sql
-- replace:  cost := coalesce(v.cost_price, prod.cost_price, 0);
-- with:
select coalesce(vc.cost_price, pc.cost_price, 0) into cost
from (select 1) _
left join public.variant_costs vc on vc.variant_id = v.id
left join public.product_costs  pc on pc.product_id = prod.id;
```

Preserve every `grant execute` these functions already have — re-state them at
the end of the migration.

Also check `receive_purchase_order` for cost writes; if it writes
`product_variants.cost_price`, change it to upsert `variant_costs` instead.

### Step 2.3 — Update the 5 admin screens

Cost must be read from and written to the new tables.

| File | What to change |
|---|---|
| `src/admin/products/ProductEditor.tsx` | Two `.select('*')` calls (on `products` ~line 132 and `product_variants` ~line 148) must become **explicit column lists excluding `cost_price`** (trap 0.4.4). Add queries for `product_costs` / `variant_costs` to populate `form.cost_price` and per-variant cost. In the save mutation, stop writing `cost_price` to `products`/`product_variants`; upsert `product_costs` / `variant_costs` instead. **All new hooks go above every early return** (trap 0.4 rule 4 — this file already had that bug). |
| `src/admin/pages/ProductsPage.tsx` | ~line 107 selects `cost_price`. Remove it from the select and join the cost via a separate `product_costs` query, or drop the column from the list view if it is only used for margin display. |
| `src/admin/reports/InventoryTab.tsx` | ~lines 87 and 95 select `cost_price` from `product_variants` and `products`. Point both at `variant_costs` / `product_costs`. |
| `src/admin/pages/InventoryPage.tsx` | ~line 977 reads `v_inventory_valuation`. No change needed if the view keeps its column names — confirm the names you used in 2.2 match. |
| `src/admin/pages/DashboardPage.tsx` | ~line 119 reads `v_product_performance`. Same — keep the view's output column names identical so this file needs no change. |

**Keep the view output column names exactly as they are today.** That is what
keeps steps 2.4 and 2.5 small.

### Step 2.4 — Migration `0021_revoke_cost_columns.sql`

Only after 2.3 is complete:

```sql
revoke select (cost_price) on public.products         from authenticated, anon;
revoke select (cost_price) on public.product_variants from authenticated, anon;
revoke insert (cost_price), update (cost_price) on public.products         from authenticated, anon;
revoke insert (cost_price), update (cost_price) on public.product_variants from authenticated, anon;
```

The columns still exist (dropped later, after review). This closes the leak
immediately.

### Step 2.5 — Regenerate `database.types.ts` again (MCP tool, overwrite).

---

## 3. Phase 3 — Business rules and money correctness

### Step 3.1 — Migration `0022_discount_scoping.sql`

`discounts.applies_to_product_id` and `applies_to_category_id` exist but
`validate_discount` ignores them, so a product-specific discount applies to the
whole basket.

- Add a parameter to `validate_discount`:
  `p_eligible_subtotal numeric default null`. When null, behave as today (the
  storefront preview calls it without this). The `min_subtotal` test and the
  percentage calculation both use `coalesce(p_eligible_subtotal, p_subtotal)`.
- Keep the old 3-argument signature working so `CheckoutPage.tsx` and any other
  caller does not break — add the new argument with a default rather than
  replacing the signature.
- In `create_pos_sale` and `create_online_order` (fetch live definitions), while
  looping the lines, accumulate a second total `v_eligible` that includes a line
  only when the discount has no scope, or the line's `product_id` matches
  `applies_to_product_id`, or the line's product's `category_id` matches
  `applies_to_category_id`. To know the scope before the loop, read the discount
  row up front when `p_discount_code` is supplied.
- Pass `v_eligible` as `p_eligible_subtotal`.
- Re-state all `grant execute` statements for every function you redefine.

### Step 3.2 — Migration `0023_loyalty_and_redemption.sql`

**a) No points on shipping.** In `award_loyalty_points`, change
`pts := floor(o.total * rate)::int;` to
`pts := floor(greatest(o.total - coalesce(o.shipping_total,0), 0) * rate)::int;`

**b) Redeemed points must not vanish.** Today `redeem_points` deducts points in
its own call with no order reference and no reversal.

- Add `public.reverse_redemption(p_customer_id uuid, p_points int, p_note text)`
  — staff-only, inserts a compensating positive `loyalty_transactions` row.
- Add optional `p_redeem_points int default 0` to `create_pos_sale`. When > 0:
  validate the balance, insert the negative `loyalty_transactions` row **inside
  the sale transaction**, set `orders.points_redeemed`, and subtract the cash
  value (`settings.loyalty.currency_per_point`, default `0.1`) from the total as
  part of `discount_total`.
- Leave the standalone `redeem_points` in place for compatibility, but add a
  comment marking it deprecated in favour of the `create_pos_sale` parameter.
- `grant execute on function public.reverse_redemption(uuid, int, text) to authenticated;`

**Do not wire any POS UI for this** unless a points-redemption control already
exists in `src/admin/pos/`. If none exists, note that in the handback log.

### Step 3.3 — Migration `0024_rollup_triggers.sql`

`refresh_customer_totals` and `refresh_product_sold` use
`coalesce(new.x, old.x)`, so reassigning a row leaves the previous owner's
totals stale.

Rewrite both to recalculate for **both** ids. Pattern:

```sql
create or replace function public.refresh_customer_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  ids := array_remove(array[old.customer_id, new.customer_id], null);
  if array_length(ids, 1) is null then return null; end if;

  update public.customers c set
    orders_count = (select count(*) from public.orders o
                     where o.customer_id = c.id and o.status <> 'cancelled'),
    total_spent  = (select coalesce(sum(o.total - o.amount_refunded), 0) from public.orders o
                     where o.customer_id = c.id and o.status <> 'cancelled'),
    last_order_at = (select max(o.placed_at) from public.orders o
                     where o.customer_id = c.id and o.status <> 'cancelled')
  where c.id = any(ids);

  return null;
end $$;
```

Note `old` is null on INSERT and `new` is null on DELETE — `array_remove` handles
both. Apply the same shape to `refresh_product_sold` using
`old.product_id` / `new.product_id`.

---

## 4. Phase 4 — Error codes and full translation  ⚠ LARGEST

Every database error message is English and is shown to users verbatim via
`toast.error(error.message)`. Arabic is the default language.

### Step 4.1 — Migration `0025_error_codes.sql`

Convention: **the exception message becomes a stable snake_case code**; human
detail goes in `DETAIL`. Example:

```sql
-- before
raise exception 'Only % left of % (%)', avail, prod.name_en, label;
-- after
raise exception 'insufficient_stock'
  using detail = format('%s|%s|%s', avail, prod.name_en, label);
```

Fetch each live function definition and convert every `raise exception`. Use
exactly these codes:

| Code | Replaces (current English) |
|---|---|
| `not_authorised` | `Not authorised…` (all variants) |
| `empty_sale` | `Cannot create an empty sale` |
| `empty_bag` | `Your bag is empty` |
| `name_required` | `A name is required` |
| `phone_required` | `A phone number is required` |
| `address_required` | `A delivery address is required` |
| `invalid_quantity` | `Quantity must be greater than zero` |
| `variant_not_found` | `Product variant % not found` |
| `item_unavailable` | `That item is no longer available` |
| `insufficient_stock` | `Not enough stock for …` / `Only % left of …` |
| `branch_unavailable` | `That branch is not available` |
| `branch_not_online` | `That branch cannot fulfil online orders` |
| `no_online_branch` | `No branch is available to fulfil online orders` |
| `customer_blocked` | `This account cannot place orders…` |
| `discount_rejected` | `Discount code rejected: %` (keep reason in DETAIL) |
| `manager_approval_required` | `A manual discount above % percent…` |
| `tendered_below_total` | `Amount tendered (%) is less than the total (%)` |
| `shift_missing` | `That till session no longer exists` |
| `shift_closed` | `That till session is already closed` |
| `shift_wrong_branch` | `That till session belongs to a different branch` |
| `order_not_found` | `Order not found` |
| `order_cancelled` | `Order was cancelled` / `Cancelled orders cannot be completed` |
| `order_unpaid` | `This order has not been paid yet…` |
| `already_refunded` | `This order has already been fully refunded` |
| `nothing_returned` | `Nothing was returned` |
| `return_exceeds_line` | `Cannot return % of % — only % remain` |
| `line_not_in_order` | `Line item does not belong to this order` |
| `customer_not_found` | `Customer not found` |
| `insufficient_points` | `Not enough points: balance is %` |
| `invalid_points` | `Points must be positive` |
| `too_many_open_orders` | `There are already % unpaid orders…` |
| `invalid_email` | `That email address does not look valid` |

Functions to convert: `create_pos_sale`, `create_online_order`,
`complete_order`, `cancel_order`, `process_return`, `validate_discount`,
`redeem_points`, `assert_shift_usable`, `open_shift`, `close_shift`,
`record_cash_movement`, `adjust_stock`, `set_stock`, `receive_purchase_order`,
`complete_stock_transfer`, `enforce_online_order_limits`,
`normalise_newsletter_email`. Re-state every `grant execute`.

### Step 4.2 — Client mapping layer

Create `src/lib/errors.ts`:

```ts
import { useT } from '@/lib/i18n'

/** Maps a database error code to a translated, user-facing sentence. */
export function useErrorText() {
  const t = useT()
  return (err: unknown): string => {
    const raw =
      typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : ''
    const detail =
      typeof err === 'object' && err && 'details' in err
        ? String((err as { details: unknown }).details ?? '')
        : ''
    const parts = detail ? detail.split('|') : []
    const key = `dbError.${raw.trim()}` as Parameters<typeof t>[0]
    const translated = t(key, { 0: parts[0] ?? '', 1: parts[1] ?? '', 2: parts[2] ?? '' })
    // Unknown code: fall back rather than showing a raw code to the user.
    return translated === key ? t('common.error') : translated
  }
}
```

Add a `dbError.<code>` entry for **every** code in the table above to **both**
`en` and `ar` in `src/lib/translations.ts`. Use `{0}`, `{1}`, `{2}` placeholders
where the old message interpolated values. Example pair:

```ts
'dbError.insufficient_stock': 'Only {0} left of {1} ({2})',
'dbError.insufficient_stock': 'بقي {0} فقط من {1} ({2})',
```

Then replace every `toast.error(error.message)` / `toast.error(e.message)` with
`toast.error(errorText(error))` using the hook. Find them with:

```bash
grep -rn "toast.error(.*\.message" src/
```

Roughly 40 sites. `useErrorText()` is a hook — call it at component top level,
above any early return.

### Step 4.3 — Migration `0026_order_event_codes.sql`

`order_events` bodies are written in English (e.g. `"Order VT-1002 created"`) and
render untranslated in the Arabic timeline.

- Add columns: `event_code text`, `event_params jsonb default '{}'::jsonb`.
- Backfill `event_code` from existing rows where the pattern is recognisable;
  leave the old text column populated for history.
- Update whatever trigger/function writes these rows to set `event_code` (e.g.
  `order_created`, `order_completed`, `order_cancelled`, `return_processed`) with
  params such as `{"order_number": "VT-1002"}`.
- In `src/admin/pages/OrderDetailPage.tsx`, render
  `t('orderEvent.' + event_code, params)` when `event_code` is present, and fall
  back to the stored text when it is not. Add `orderEvent.*` keys in both
  languages.

---

## 5. Phase 5 — Frontend correctness and polish

### Step 5.1 — Checkout becomes a real form
`src/storefront/pages/CheckoutPage.tsx`

- Wrap the fields in `<form onSubmit={...}>` and make the place-order button
  `type="submit"` so Enter works and `required` means something.
- Replace placeholder-only fields with real `<label>` elements (use `sr-only` if
  the design must stay unchanged visually). Every input gets an `id` and its
  label a matching `htmlFor`.
- Keep using the existing UI primitives from `src/components/ui` where they fit.

### Step 5.2 — Per-page document titles

Create `src/lib/useDocumentTitle.ts`:

```ts
import { useEffect } from 'react'

/** Sets document.title, restoring nothing — every routed page sets its own. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Vitality` : 'Vitality'
  }, [title])
}
```

Call it in each routed page (storefront: home, catalog, product, cart, checkout,
order confirmation, track, account sections; admin: dashboard, POS, orders,
order detail, products, product editor, inventory, purchasing, customers,
discounts, reports, cash, staff, storefront CMS, settings). Use translated
strings. Product and order pages should include the product name / order number.

### Step 5.3 — Route-level code splitting
`src/App.tsx`

The main JS chunk is ~796 kB because admin and storefront ship together. Convert
route components to `React.lazy(() => import(...))` and wrap the router outlet in
`<Suspense fallback={...}>` using the existing `Spinner`. Split at minimum:
the whole `/admin` tree, the reports tab group, and `ProductEditor`. Keep
`vite.config.ts`'s existing `manualChunks` as they are.

---

## 6. Phase 6 — Security housekeeping

### Step 6.1 — Migration `0027_review_purchase_requirement.sql`

Replace `reviews_own_insert` so a review requires a completed purchase:

```sql
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
```

Verify the column name on `reviews` is `product_id` before applying; if the
policy cannot reference `reviews.product_id` in `WITH CHECK`, use a
`BEFORE INSERT` trigger enforcing the same rule instead. Staff keep their
existing full-write policy, so seeding reviews as staff still works.

### Step 6.2 — Migration `0028_remove_bootstrap_owner.sql`

`handle_new_user()` promotes the first signup to `owner` when no staff profile
exists. An owner now exists, so this is a spare key under the mat.

Fetch the live definition and replace the role decision with a constant
`'customer'`, keeping everything else (the `full_name` / `phone` metadata
handling, `on conflict (id) do nothing`) identical. Add a comment stating that
recovering from a total loss of admin accounts is now a Supabase-dashboard
operation, deliberately.

### Step 6.3 — Migration `0029_audit_coverage.sql`

Add `AFTER INSERT OR UPDATE OR DELETE` triggers writing to `audit_log` for the
security-relevant tables: `profiles` (role and `is_active` changes),
`discounts`, `settings`, `locations`, and price changes on `products` /
`product_variants` / the new cost tables.

Inspect `audit_log`'s columns first and match them exactly. One shared
`SECURITY DEFINER` trigger function using `tg_table_name`, `tg_op`,
`to_jsonb(old)` / `to_jsonb(new)` and `auth.uid()`.

### Step 6.4 — Migration `0030_extensions_schema.sql`  ⚠ do this one LAST

`pg_trgm` and `unaccent` live in `public`. Moving them is correct but **risks the
indexes that depend on them**.

```sql
create schema if not exists extensions;
alter extension pg_trgm  set schema extensions;
alter extension unaccent set schema extensions;
```

Then ensure every function that relies on them can still resolve them: functions
declared `set search_path = public` will no longer see `pg_trgm` operators. For
each such function, change to `set search_path = public, extensions`.

**If `alter extension … set schema` errors** (dependent objects usually cause
this), do not force it. Revert the schema creation, record the error verbatim in
the handback log, and move on. This item is low value and not worth breaking
search over.

---

## 7. Phase 7 — Finalisation

1. **Regenerate `database.types.ts`** one final time via the MCP tool.
2. **Do not** drop `products.cost_price` / `product_variants.cost_price`. Leave a
   file `supabase/migrations/PENDING_0031_drop_cost_columns.sql.txt` (note the
   `.txt` so it cannot be run by accident) containing the two `alter table …
   drop column` statements and a comment saying it must not be applied until the
   author has verified Phase 2.
3. **Update the docs:**
   - `docs/BUG_REPORT.md` — mark the items you fixed, keeping the existing
     `S…` numbering.
   - `docs/SECURITY_REVIEW.md` — mark SEC-01b, SEC-12, SEC-15, SEC-18, SEC-21.
   - `README.md` — document the new cost tables, the error-code convention, and
     that `_headers` carries a CSP whose hash must be recomputed if the inline
     script in `index.html` ever changes.
4. Do **not** run the app, the build, the linter or any test.

---

## 8. Handback log — required

Create `docs/EXECUTION_LOG.md` as you work. This is the only thing standing
between your work and the author's review, so it matters more than usual.

For **every** step, record:

```markdown
### Step <n> — <title>
Status: DONE | PARTIAL | SKIPPED | BLOCKED
Migration applied: <name or "none">
Files changed: <paths>
Deviations: <anything that differed from this plan, verbatim errors, anything
            you had to decide yourself, anything you could not find>
```

Be specific about deviations. If a function body did not look like this plan
described, say so and quote what you actually found. If you skipped something,
say why. An honest PARTIAL is far more useful than an optimistic DONE.

---

## 9. Order of work, and where to stop

Strict order. Each phase depends on the previous one being on disk.

| # | Phase | Risk | Why here |
|---|---|---|---|
| 1 | Rebuild path | Low | Nothing else matters if the repo can't rebuild the DB |
| 2 | Cost separation | **High** | Isolated, and the one real remaining security hole |
| 3 | Business rules | Medium | Money logic; do before error codes rewrite the same functions |
| 4 | Error codes | Medium | Touches every function Phase 3 just changed — must come after |
| 5 | Frontend polish | Low | Independent |
| 6 | Security housekeeping | Low, except 6.4 | 6.4 last because it can fail harmlessly |
| 7 | Finalisation | Low | Types, docs, deferred column drop |

**Stop immediately and record it if:** a migration fails to apply, a live
function body contradicts this plan, `generate_typescript_types` fails, or you
find yourself about to delete data. Never delete rows. Never force a failing
migration.

When Phase 7 is complete, stop and hand back. The author verifies everything.
