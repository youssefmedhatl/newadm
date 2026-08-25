# P11 — Storefront: shell, home, catalog, product page

Read `docs/REMAINING_WORK.md` and `docs/BUILD_SPEC.md` first.
Also open `docs/original-storefront.html` — that is the original hand-built
design this must feel like. Match its visual language; do not invent a new one.

**Files you own:** everything under a new `src/storefront/`, plus the `/` route
tree in `src/App.tsx`, plus `src/lib/translations.ts` (Edit only).
Do NOT touch anything under `src/admin/`.

The `/` route is currently a placeholder. You are replacing it.

---

## Design language (from the original)

Tokens are already in `src/index.css`: `ink #111110`, `bone #F6F6F4`,
`moss #4A4A47`, `ember #1A1A18`, `sand #D9D8D3`.

- Headings use the `.display` class — Anton, uppercase, tight leading. It
  automatically swaps to IBM Plex Sans Arabic weight 700 in RTL, because Anton
  has no Arabic glyphs. Size comes from Tailwind utilities at the call site.
- Body text: Space Grotesk (Latin), IBM Plex Sans Arabic (Arabic) — handled by
  `[dir]` rules already in the CSS.
- Cards `rounded-2xl`, product images `aspect-[4/5] rounded-2xl`, buttons
  `rounded-full`, borders 1px `sand`, almost no shadows.
- Product card hover lifts the image slightly. Keep motion subtle, and respect
  the existing `prefers-reduced-motion` block.

**There are no product photos in the database yet.** Every product currently has
zero `product_images` rows. Your placeholder must therefore look deliberate:
render a flat block using the variant's `color_hex` (the original design used
exactly this), never a broken image icon. When `primary_image` exists, use it.

---

## A. Storefront shell — `src/storefront/StoreLayout.tsx`

- Sticky nav: wordmark (links home), links (Shop, Men, Women, Rewards),
  then search, wishlist and bag icons with count badges.
- Mobile: hamburger collapsing the links.
- **Language toggle** (ar/en) — reuse `useLocale()`. The whole storefront must
  work in both directions.
- Marquee ticker below the nav, from `marquee_messages` where `is_active`,
  ordered by `position`, using `text_en`/`text_ar`. CSS scroll animation, paused
  under `prefers-reduced-motion`.
- Footer: shop links, support, account, plus a newsletter form inserting into
  `newsletter_subscribers` (anon insert is permitted by RLS). Validate the email
  and show a success toast via `t()`.
- `<Outlet />` for pages.

Auth here is the **customer** side — a signed-in customer is a normal
`authenticated` user whose `profiles.role` is `customer`. Do NOT use
`RequireStaff` anywhere in the storefront.

## B. Home — `src/storefront/pages/HomePage.tsx`

- **Hero** from `content_blocks` where `key = 'hero'`: background video or image
  from `media_url` (`media_type`), grayscale + dark gradient overlay as in the
  original, with `title`, `subtitle` and a CTA in the active locale. Falls back
  to `/vitality-hero.mp4`. The video needs `autoplay muted loop playsinline` and
  a poster; never autoplay with sound.
- **New arrivals** — `v_storefront_products` where `is_new`, limit 8.
- **Collections** — from `collections` where `is_active`, ordered by `position`,
  each linking to `/collections/:slug`.
- **Featured** — `v_storefront_products` where `is_featured`.
- **Rewards promo** from `content_blocks` where `key = 'rewards'`.

## C. Catalog — `src/storefront/pages/CatalogPage.tsx`, route `/shop`

Read `v_storefront_products` (public, RLS-safe, already has `sizes[]`,
`colors[]`, `primary_image`, `available_stock`).

- Filters: category (from `categories`), size, colour, price range, in-stock
  only. Sizes and colours come from the `sizes`/`colors` array columns.
- Sort: newest, price low→high, price high→low, best selling (`total_sold`).
- Search box matching `name_en`/`name_ar`. Sanitise before any `.or()`.
- Reflect filters in the URL query string so a filtered view can be shared and
  survives reload.
- Pagination or "load more".
- Product card: image or colour-block placeholder, name via `useLocalized()`,
  category, price via `formatMoney`, a `compare_at_price` strike-through when
  set, a "New" badge, a wishlist heart, and an "Out of stock" state when
  `available_stock = 0`.
- Empty state when filters match nothing, with a reset action.

Also `/collections/:slug` — same grid, filtered through `collection_products`.

## D. Product page — `src/storefront/pages/ProductPage.tsx`, route `/product/:slug`

- Gallery from `product_images` ordered by `position`; falls back to the colour
  block. If images carry a `color_name`, swap the gallery when a colour is
  chosen.
- Name, price, `compare_at_price`, description, material, care — all localized.
- **Size and colour selectors driven by real stock.** Load the product's
  variants joined to `inventory_levels`, summed across branches that sell
  online:
  - A size/colour combination with 0 available renders disabled and struck
    through — do not let a customer pick something unbuyable.
  - Show "Only N left" when available is low (say ≤ 5).
  - The chosen combination resolves to exactly one `product_variants.id` — that
    id is what the cart stores. Nothing else identifies a purchasable item.
- Quantity stepper capped at available stock.
- Add to bag → the cart store from P12. If P12 is not built yet, put the cart
  store in `src/storefront/useCart.ts` now, persisted to
  `localStorage['vitality.shop.cart']`, storing `{ variant_id, quantity }` plus
  display fields.
- Reviews: `reviews` where `status = 'approved'`, with the average and count
  from `products.rating_avg`/`rating_count`. A signed-in customer may submit one
  — insert with `user_id = auth.uid()` and `status = 'pending'`; RLS enforces
  exactly that shape. Tell them it awaits approval.
- Related products from the same category.

---

## Rules specific to the storefront

- Everything here is readable by `anon`. Do not query staff-only tables
  (`orders`, `customers`, `discounts`, `profiles`, `cash_movements` …) — RLS
  returns zero rows and you will render an empty page wondering why.
- Prices come from the database. Never compute or hardcode one.
- Product/category names are bilingual columns — always `useLocalized()`, never
  `name_en` directly.
- The whole storefront must be usable in Arabic RTL. Sliders, carousels and
  arrows all need to flip.
- Mobile first — most customers will be on a phone.

## Gate

Every gate command in `REMAINING_WORK.md`, plus: run `npm run dev`, open the
storefront, and confirm in BOTH languages that the home page renders, the
catalog filters work, and a product page shows size/colour options with stock
awareness. Report what you actually saw.
