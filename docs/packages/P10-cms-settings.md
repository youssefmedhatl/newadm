# P10 — Storefront CMS + Settings

Read `docs/REMAINING_WORK.md` and `docs/BUILD_SPEC.md` first.

**Files you own:** `src/admin/pages/StorefrontPage.tsx`,
`src/admin/pages/SettingsPage.tsx`, a new `src/admin/settings/` folder, and
`src/lib/translations.ts` (Edit only).

Both pages are currently `comingSoon` placeholders. This package is what lets
the shop owner change the public site without a developer — P11 and P12 will
read everything you set up here.

---

## A. Storefront CMS

Guard with `useCan()('cms')`. Use `Tabs`.

**Tab 1 — Hero & content blocks**
Edit `content_blocks`. Two rows are already seeded: `hero` and `rewards`.
- Bilingual fields side by side with clear EN / AR labels: `title_en`/`title_ar`,
  `subtitle_en`/`subtitle_ar`, `body_en`/`body_ar`, `cta_label_en`/`cta_label_ar`,
  plus `cta_href`, `is_active`, `position`.
- `media_url` + `media_type` (`video` | `image`). Allow either pasting a URL or
  uploading to the `product-images` Storage bucket (same pattern as the product
  image uploader in `src/admin/products/ProductEditor.tsx` — reuse that
  approach; validate type and a 5 MB cap).
- The hero currently points at `/vitality-hero.mp4`, which ships in `public/`.
  Keep that as the default if the field is cleared.
- Live preview panel showing roughly how it will look, in the current locale.

**Tab 2 — Marquee**
CRUD on `marquee_messages`: `text_en`, `text_ar`, `is_active`, `position`, with
reordering. This is the scrolling ticker under the storefront nav. Three rows
are seeded.

**Tab 3 — Collections**
CRUD on `collections`: `slug`, `title_en`/`title_ar`, `subtitle_en`/`subtitle_ar`,
`image_url`, `is_active`, `position`.
Manage membership through `collection_products` — a product picker with search,
and drag or up/down ordering via `position`. Two collections are seeded
(`new-arrivals`, `bestsellers`).

**Tab 4 — Reviews moderation**
List `reviews` filtered by `status` (`pending` / `approved` / `rejected`).
Show product, author, rating stars, title, body, date.
Approve / reject by updating `reviews.status`; a trigger recomputes
`products.rating_avg` and `rating_count`, so **do not write those columns**.
Optionally add a `reply` and set `replied_at`.

**Tab 5 — Newsletter**
Read-only list of `newsletter_subscribers` (email, subscribed, source, date),
with a CSV export using the same BOM technique described in P9.

---

## B. Settings

Guard with `useCan()('settings')` (owner/manager). The `settings` table is a
key/value JSON store; six rows are seeded. Edit `value` as structured form
fields, **never as a raw JSON textarea**.

| key | fields |
|---|---|
| `store` | `name_en`, `name_ar`, `tagline_en`, `tagline_ar`, `currency`, `currency_symbol_en`, `currency_symbol_ar`, `phone`, `email`, `default_locale` |
| `loyalty` | `enabled`, `points_per_currency`, `currency_per_point` |
| `shipping` | `flat_fee`, `free_over` |
| `tax` | `enabled`, `rate` |
| `receipt` | `footer_en`, `footer_ar`, `show_logo`, `return_days` |
| `inventory` | `default_reorder_point`, `default_reorder_qty` |

Explain each in plain language next to the field — e.g. for `loyalty`, show a
worked example: "1 point per EGP spent, 100 points = 10 EGP off". These values
directly drive `create_online_order` (shipping) and `award_loyalty_points`
(loyalty), so a typo has real consequences. Say so.

`is_public` controls whether the storefront can read a row. Show it as a
read-only indicator; do not let it be edited casually — `receipt` and
`inventory` are deliberately private.

**Branches** — full CRUD on `locations`: `name_en`, `name_ar`, `code`, address,
city, phone, `is_warehouse`, `sells_online`, `is_active`, `position`.
`sells_online` decides which branch fulfils online orders —
`create_online_order` picks the first active branch with `sells_online = true`
ordered by `position`. Explain that in the UI. Warn before deactivating the last
one that sells online, since checkout would then fail with "No branch is
available to fulfil online orders".

**Categories & brands** — CRUD on `categories` (with `parent_id` nesting) and
`brands`. Both are referenced by products.

Writes are manager-only at the database level, so a cashier opening this page
should see it read-only rather than getting errors on save.

---

## Gate

Every gate command in `REMAINING_WORK.md`. Additionally confirm that saving a
setting round-trips: change a value, reload, confirm it persisted.
