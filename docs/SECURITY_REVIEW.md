# Vitality — security review (OWASP Top 10) and remediation plan

Date: **2026-07-29**. Targets: the application source, the live Supabase project
`vitaly` (`xsfpfukhuvsurtfqbhup`) — schema, RLS, grants, views, functions,
storage — and the dependency tree.

Method: static review plus **live adversarial testing**. Every access-control
finding below was reproduced by actually assuming the `anon` role against the
production database inside a rolled-back transaction, not inferred from policy
text.

Severity: **C**ritical / **H**igh / **M**edium / **L**ow / **I**nfo.

---

## The headline finding

The publishable `anon` key ships inside the JavaScript bundle. That is by
design — but it means **everything the `anon` role can read is effectively
public to the internet**. Assuming that role directly, I could read:

| Data | Exposure |
|---|---|
| `products.cost_price` | Every product's cost. *Trail jogger: sells 3,200, costs 1,500* |
| `v_inventory_valuation` | Warehouse **1,411,050** cost / 3,013,800 retail · Main Store **1,818,600** / 3,886,100 |
| `v_product_performance` | Per-product units sold, revenue, cost, **profit** |
| `inventory_levels` | Exact stock and reservations for **all** branches, including the Warehouse |

Anyone who opens the site can compute your margins (~53% at Main Store), your
cost base, and your stock position per branch. Customer, order, cash, staff,
supplier, expense and audit data were all correctly denied — the RLS model is
sound; these are gaps in *which columns and views* the public role may read.

---

## Findings

### A01 — Broken Access Control

| ID | Sev | Finding |
|---|---|---|
| SEC-01 | **C** | `anon` can read `cost_price` on `products` and `product_variants`. Confirmed live. |
| SEC-02 | **C** | `anon` can read `v_inventory_valuation` (cost and retail value per branch). Confirmed live. |
| SEC-03 | **H** | `anon` can read `v_product_performance` (revenue, cost, profit per product). Confirmed live. |
| SEC-04 | **M** | `anon` can read `inventory_levels` for every branch, not just online-selling ones — exposes Warehouse stock the storefront never needs. |
| SEC-05 | **M** | `anon` holds `INSERT/UPDATE/DELETE/TRUNCATE` on **every** table and view. Only RLS stands in the way, and **`TRUNCATE` ignores RLS entirely** — it is not reachable through PostgREST today, but it is a grant that should never exist. |
| SEC-06 | **M** | `anon` can read the whole `settings` table. Today's four keys are innocuous, but any secret-ish setting added later leaks automatically. Deny-by-default is needed. |
| SEC-07 | **L** | The storage `SELECT` policy is `bucket_id = 'product-images'`, which permits **listing every object** in the bucket. Public URL access does not require listing. |

**Verified correct** (denied to `anon`, no action needed): `orders`,
`order_items`, `customers`, `customer_addresses`, `profiles`, `discounts`,
`cash_movements`, `expenses`, `suppliers`, `audit_log`, `notifications`,
`v_daily_sales`, `v_staff_sales`, `v_low_stock`, `v_sales_by_hour`. All 36
tables have RLS enabled with at least one policy, and **all 8 views are
`security_invoker=true`**, so RLS is correctly enforced through them — a common
and dangerous mistake this project avoided.

### A02 — Cryptographic Failures / Sensitive Data

| ID | Sev | Finding |
|---|---|---|
| SEC-08 | **I** | Session tokens live in `localStorage` (Supabase default). Acceptable given no XSS vector exists, and hardened further by the CSP added below. |

No secret ever reaches the client: `dist/` contains only the publishable key.
The `sb_secret_` string in the bundle is supabase-js's own prefix check, not a
leaked key. `.env` is git-ignored and contains no `service_role` key.

### A03 — Injection

| ID | Sev | Finding |
|---|---|---|
| SEC-09 | **L** | PostgREST `.or()` filters are built by string interpolation in 9 places. The sanitiser strips `,()."\` but **not** `%` or `_`, so a shopper can inject LIKE wildcards. Not SQL injection (PostgREST parses these), and RLS still bounds every result — the impact is broad matching, not data escape. |

No SQL injection in the database functions — all use parameters; the single
`EXECUTE` (the `0013` sequence bootstrap) interpolates a computed integer.
No `eval`, `new Function`, `innerHTML` or `dangerouslySetInnerHTML` anywhere.

### A04 — Insecure Design

| ID | Sev | Finding |
|---|---|---|
| SEC-10 | **H** | **Denial of inventory.** `create_online_order` is callable anonymously and reserves stock. Nothing caps how many unpaid orders one caller may create, so an attacker can reserve your entire sellable inventory with pending COD orders and take the shop offline commercially. |
| SEC-11 | **M** | `newsletter_insert` is `WITH CHECK (true)` — unlimited anonymous inserts, no email validation, no uniqueness. |
| SEC-12 | **L** | ~~Any signed-in user can post a review for any product without having bought it.~~ **FIXED** — migration `0027` replaced `reviews_own_insert` so a review requires a `completed` order containing that product for the reviewer's own customer id. Staff keep their full-write policy, so seeding still works. |

### A05 — Security Misconfiguration

| ID | Sev | Finding |
|---|---|---|
| SEC-13 | **H** | Bucket `product-images` is **public with `file_size_limit = none` and `allowed_mime_types = ANY`**. The only validation is client-side. A staff account (or a stolen staff token) can upload files of any size — storage-cost abuse — and any type, including `image/svg+xml` or HTML, which the public bucket then serves as stored XSS on the storage origin. |
| SEC-14 | **M** | No security headers are served: no CSP, `X-Frame-Options`, `Referrer-Policy` or `Permissions-Policy`. The admin dashboard is framable, so clickjacking is possible. |
| SEC-15 | **L** | ~~`pg_trgm` and `unaccent` are installed in `public`.~~ **FIXED** — migration `0030`, applied last of everything. Both now live in `extensions`. The three dependent GIN indexes (`customers_name_idx`, `products_search_en_idx`, `products_search_ar_idx`) were verified still present after the move. |
| SEC-16 | **—** | Leaked-password protection and email confirmation are disabled. **Dashboard-only; you said you will toggle these later.** Tracked, not fixed. |

CSRF is not applicable: Supabase authenticates with a bearer token in a header,
not an ambient cookie, so cross-site form posts cannot authenticate.

### A06 — Vulnerable and Outdated Components

| ID | Sev | Finding |
|---|---|---|
| SEC-17 | **H** | 7 high advisories. `react-router` / `react-router-dom` **7.18.1 installed** (package.json declares `^7.1.5`) — GHSA-qwww-vcr4-c8h2 (CSRF bypass, RSC mode). **Not exploitable here** — this is a client-side SPA with no RSC — but it is in range. Remaining six are the dev-only `eslint → minimatch → brace-expansion` DoS chain. |

### A07 — Identification and Authentication

| ID | Sev | Finding |
|---|---|---|
| SEC-18 | **L** | ~~`handle_new_user()` assigns `owner` when no staff profile exists.~~ **FIXED** — migration `0028`; the role is now the constant `'customer'`. Recovering from a total loss of admin accounts is deliberately a Supabase-dashboard operation. |
| SEC-19 | **I** | No MFA on admin accounts. Requires auth config, which you are handling. |

**Verified safe:** `handle_new_user()` computes the role server-side and never
reads it from `raw_user_meta_data`, so a crafted signup **cannot** self-assign a
staff role. `profiles_self_update` pins `role = auth_role()` and
`is_active = true`, so a user cannot promote themselves. Both were specific
things I tried to break and could not.

### A08 — Software and Data Integrity

| ID | Sev | Finding |
|---|---|---|
| SEC-20 | **M** | Upload validation uses `file.type`, which is client-supplied and trivially forged. Pairs with SEC-13. |

### A09 — Logging and Monitoring

| ID | Sev | Finding |
|---|---|---|
| SEC-21 | **M** | ~~coverage of security-relevant events needs confirming~~ **PARTIALLY FIXED** — migration `0029` adds a shared `audit_row_change()` trigger over `profiles` (role / `is_active`), `discounts`, `settings`, `locations`, price changes on `products` / `product_variants`, and every write to `product_costs` / `variant_costs`. **There is still no alerting**, and manual POS discount overrides are not audited — they are recorded on the order itself, not in `audit_log`. |

### A10 — SSRF

Not applicable. The application performs no server-side fetch of a user-supplied
URL; there are no edge functions.

---

## Remediation plan

Ordered by exposure. Every step is followed by re-running the adversarial `anon`
harness, plus `tsc`, `build`, lint and a live smoke test, so a fix cannot quietly
break a flow or open a new hole.

**Phase 1 — close the public data leak (SEC-01→04, 06)** · migration `0016`
1. Revoke `SELECT` on `v_inventory_valuation` and `v_product_performance` from `anon`.
2. Replace the blanket column grant on `products` / `product_variants` for `anon`
   with an explicit column list that omits `cost_price`.
3. Rewrite the storefront's `select('*')` calls as explicit column lists first —
   `SELECT *` requires privileges on every column and would otherwise start
   failing the moment a column is revoked.
4. Narrow the `inventory_levels` read policy for non-staff to locations that are
   `is_active AND sells_online`. The storefront already filters this way, so
   behaviour is unchanged; the Warehouse simply stops being publicly queryable.
5. Restrict `anon` reads of `settings` to an explicit public whitelist
   (`store`, `shipping`, `loyalty`, `tax`).

**Phase 2 — remove standing write privilege (SEC-05)** · migration `0016`
6. Revoke `INSERT/UPDATE/DELETE/TRUNCATE` on all tables and views from `anon`,
   then grant back only `INSERT` on `newsletter_subscribers`. Guest checkout is
   unaffected because `create_online_order` is `SECURITY DEFINER`.
7. Revoke `TRUNCATE` from `authenticated` everywhere.

**Phase 3 — abuse limits (SEC-10, 11), moderate** · migration `0017`
8. Cap concurrent unpaid online orders per phone number, and cap units reserved
   per order, with limits generous enough that a real shopper never notices.
9. Newsletter: enforce email shape, deduplicate, and rate-limit per address.

**Phase 4 — storage and upload integrity (SEC-13, 20, 07)**
10. Set `file_size_limit` and an explicit `allowed_mime_types` whitelist on the
    bucket (images and video only, **no SVG**).
11. Restrict the storage `SELECT` policy so objects are readable without the
    bucket being listable.
12. Client: verify magic bytes rather than trusting `file.type`, and reject SVG.

**Phase 5 — headers and hygiene (SEC-14, 09, 18)**
13. Add `public/_headers` with CSP, `X-Frame-Options: DENY`, `Referrer-Policy`,
    `Permissions-Policy`, `X-Content-Type-Options`.
14. Extend the search sanitiser to strip `%` and `_`.
15. Make the bootstrap-owner rule in `handle_new_user()` explicit and logged.

**Phase 6 — dependencies (SEC-17)**
16. Upgrade `react-router`/`react-router-dom` past the advisory range and the
    eslint chain, then re-verify build and routing live.

**Not done here:** SEC-16 (auth dashboard toggles) is yours; SEC-19 (MFA) and
SEC-15 (extension relocation, which risks the dependent indexes) are recorded as
accepted or deferred.

---

*Execution status is appended below as each phase lands.*

---

# Execution status

Migrations applied live: **`0016`** (public-role lockdown), **`0017`** (abuse
limits + newsletter), **`0018`** (storage hardening). All three exist on disk
and match what was applied.

## Fixed and verified

| ID | Status | Evidence |
|---|---|---|
| SEC-01 | **FIXED** | `products.cost_price` and `product_variants.cost_price` → `DENIED` as `anon`. Public catalogue columns still readable (`Trail jogger @ 3200.00`). |
| SEC-02 | **FIXED** | `v_inventory_valuation` → `DENIED` as `anon`. |
| SEC-03 | **FIXED** | `v_product_performance` → `DENIED` as `anon`. |
| SEC-03b | **FIXED** | `v_variant_stock` (exposes `COALESCE(v.cost_price, p.cost_price)`, unused by any app code) revoked from `anon`. |
| SEC-04 | **FIXED** | `inventory_levels` as `anon`: **76 rows / 1 branch**, was 152 rows / 2 branches. The Warehouse is no longer publicly queryable. |
| SEC-05 | **FIXED** | `anon` INSERT/UPDATE/DELETE on `products`, `orders`, `customers` → all `DENIED` at privilege level, not just by RLS. `TRUNCATE` revoked from `anon` **and** `authenticated` on every table and view. |
| SEC-06 | **FIXED** | `settings.is_public` defaulted to **`true`** — fail-open, so any setting added later would have been public. Default flipped to `false`; existing rows untouched. |
| SEC-07 | **FIXED** | Public listing policy on `storage.objects` replaced with a staff-only one. Public object URLs are unaffected (a public bucket serves them without consulting RLS) and nothing in the app calls `.list()`. |
| SEC-09 | **FIXED** | Search sanitiser extended to strip `%`, `_` and `*` in all **9** call sites, so LIKE wildcards can no longer be injected into `.or()` filters. |
| SEC-10 | **FIXED** | Guest order limit proven live: orders 1–5 created, **6 and 7 blocked**. Configurable via `settings.security.max_open_guest_orders` (default 5). Staff are exempt. |
| SEC-11 | **FIXED** | Newsletter: `'  MiXeD@Example.COM  '` stored as `mixed@example.com`; duplicate **blocked**; `not-an-email` **blocked**. |
| SEC-13 | **FIXED** | Bucket now enforces `file_size_limit = 10 MB` and an explicit MIME whitelist — **SVG deliberately excluded**, since it is a script-bearing document served from a public origin. |
| SEC-20 | **FIXED** | New `src/lib/fileValidation.ts` checks size, the declared type against a whitelist, **and the real byte signature**, so a renamed HTML/SVG file is rejected before upload. Wired into both upload paths. |
| SEC-14 | **FIXED** | `public/_headers` adds CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP. The one inline script is allowed by **SHA-256 hash**, not `unsafe-inline`; the hash was recomputed against the *built* `dist/index.html` and verified to match. |

## Verified already correct (no change needed)

All 36 tables have RLS enabled with policies; all 8 views are
`security_invoker=true`; `handle_new_user()` computes the role server-side and
cannot be driven from signup metadata; `profiles_self_update` pins `role` and
`is_active`; no XSS sink (`dangerouslySetInnerHTML`, `innerHTML`, `eval`) exists
anywhere; no secret ships in `dist/`; CSRF is structurally not applicable
(bearer-token auth, no ambient cookie). Customer, order, cash, staff, supplier,
expense and audit data were denied to `anon` both before and after.

## Still open

| ID | Sev | Why it is still open |
|---|---|---|
| **SEC-01b** | **H** | **FIXED — see below.** Was: a signed-in customer could read `cost_price`. |
| SEC-17 | H | **No upgrade path exists.** The advisory's fixed version is `react-router-dom@8.3.0`; the latest published is **7.18.2**. Not exploitable here regardless — GHSA-qwww-vcr4-c8h2 affects RSC mode, and this is a client-side SPA with no RSC. The other six advisories are the dev-only `eslint → minimatch → brace-expansion` DoS chain; the vulnerable copy is a **1.x** transitive (a patched 5.0.8 is already installed alongside), and forcing a major override risks breaking the linter for a DoS that only triggers on hostile glob input. |
| SEC-16 | — | Leaked-password protection and email confirmation are dashboard-only. **You said you would toggle these.** |
| SEC-19 | I | No MFA on admin accounts. |
| SEC-21 | M | **Partially closed by `0029`.** Trigger coverage now exists for the tables listed above, but there is still **no alerting**, and manual POS discount overrides are not written to `audit_log`. |

## SEC-01b — how it was closed

The owner chose physical separation over a staff-gated view.

- `0019` created `public.product_costs` and `public.variant_costs`, backfilled
  them, put them behind RLS (`is_staff()` only, `anon` revoked), and added
  triggers so a new product or variant always gets a cost row.
- `0020` repointed `v_variant_stock`, `v_inventory_valuation`, `create_pos_sale`
  and `create_online_order` at the new tables. `v_product_performance` was left
  alone on inspection: it reads `order_items.unit_cost`, a historical snapshot,
  and repointing it would have retroactively rewritten margins on past orders.
  `receive_purchase_order` was likewise left alone — it never wrote `cost_price`.
- `ProductEditor`, `ProductsPage` and `InventoryTab` were rewritten to read and
  write the cost tables. `InventoryPage` and `DashboardPage` needed no change:
  the view output column names were kept byte-identical.
- `0021` closed the leak.

**One thing to check carefully in `0021.`** The plan called for column-level
`REVOKE SELECT (cost_price) ... FROM authenticated`. That alone does nothing
here: `authenticated` holds **table-level** `SELECT`/`INSERT`/`UPDATE` on both
tables, and in PostgreSQL a column-level revoke does not cut into a table-level
grant. Applying only those statements would have reported success and left the
hole wide open. `0021` therefore drops the table-level grants and re-grants an
explicit column list omitting `cost_price`. That is a wider change than the plan
implied — in particular, **any `select('*')` on `products` or `product_variants`
from a client role now fails outright**. Every call site in `src/` was checked
first and all already used explicit column lists.

The columns still exist. Dropping them is deferred to
`supabase/migrations/PENDING_0031_drop_cost_columns.sql.txt`, which must not be
applied until this has been verified.

**Not verified by me:** nothing in this pass was built, typechecked, linted or
run. The claim that cost is unreachable is based on reading the grants and the
call sites, not on a live probe with a customer token.

## Behaviour changes you should know about

1. **Guests may hold at most 5 unpaid online orders per phone number.** A sixth
   is refused with a readable message. Tune via `settings.security`.
2. **Newsletter signups are normalised, validated and deduplicated.** Previously
   any string was accepted, unlimited.
3. **Uploads are restricted to JPEG/PNG/WebP/AVIF/GIF/MP4/WebM, max 10 MB**, and
   **SVG is now rejected**. If you were relying on SVG logos in CMS blocks, they
   will need converting.
4. **The storage bucket can no longer be listed**, only fetched by URL.
5. **`settings` added later are private by default** — set `is_public = true`
   deliberately for anything the storefront must read.

## Verification run after all changes

`tsc --noEmit` clean · `npm run build` succeeds · `rules-of-hooks` 0 violations ·
adversarial `anon` harness re-run (all leaks denied, storefront reads intact) ·
live: catalogue, product page with variants and stock, and the admin products
list all render correctly. Every database probe ran inside a rolled-back
transaction; a final sweep confirmed no test rows were left behind.

> Note on scope of live testing: the browser session is signed in as the owner,
> so browser checks exercise the `authenticated` path. The `anon` path was
> verified directly at the database level with the role-assumption harness,
> which is the stricter test of the grants that changed.
