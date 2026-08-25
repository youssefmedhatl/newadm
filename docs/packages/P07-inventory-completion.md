# P7 — Finish Inventory + Purchasing

Read `docs/REMAINING_WORK.md` and `docs/BUILD_SPEC.md` first.

**Files you own:** `src/admin/pages/InventoryPage.tsx`,
`src/admin/pages/PurchasingPage.tsx`, a new `src/admin/inventory/` folder,
and `src/lib/translations.ts`.

## Already built — do not rebuild

`InventoryPage.tsx` already has working: Tab 1 stock-on-hand (with the adjust
modal calling `rpc('adjust_stock')`), Tab 3 movement ledger, Tab 4 valuation +
low stock. `PurchasingPage.tsx` already has working Suppliers CRUD and a
purchase-order LIST.

## Three things are missing

A grep for `set_stock`, `receive_purchase_order` and `complete_stock_transfer`
currently returns nothing outside `database.types.ts`. That is what you are
fixing.

---

### 1. Stocktake — Tab 2 of InventoryPage

`InventoryPage.tsx` around line 446 currently renders a `comingSoon` string.
Replace it with a real counting screen.

- Branch `Select` at the top. All counting happens against that branch.
- A search/scan box: matches product name (en/ar), SKU, or barcode.
  **Barcode behaviour** — if the typed text exactly matches a
  `product_variants.barcode` and the user presses Enter, jump straight to that
  variant and focus the count input. Scanners type fast then send Enter.
- When a variant is selected, show its current system quantity (from
  `inventory_levels.quantity` at that branch) and an input for the physically
  counted number.
- Submit calls:
  ```ts
  await supabase.rpc('set_stock', {
    p_variant_id, p_location_id, p_counted, p_note,
  })
  ```
  The database computes the difference and records it as a `stocktake`
  movement. **Never write `quantity` directly.**
- Keep a running session list in component state: product, variant, system qty
  at time of count, counted qty, and variance (`counted - system`). Colour the
  variance — `danger` when negative, `success` when positive, neutral at 0.
- Session summary line: lines counted, total units gained, total units lost.
- `invalidateQueries` on `['inventory_levels']` and `['dashboard']` after each
  submission.

### 2. Branch transfers

A `Drawer` opened from the Inventory page (it already slides from the correct
edge in both languages — do not add direction logic).

- Source and destination branch selectors. They must differ — the
  `stock_transfers` table has a CHECK constraint enforcing it, so validate
  client-side too and explain why.
- Add variants with quantities. Validate each against **available**
  (`quantity - reserved`) at the SOURCE branch, not `quantity`.
- On submit:
  1. Insert a `stock_transfers` row with a unique `reference`, e.g.
     `` `TR-${Date.now()}` ``, plus `from_location_id`, `to_location_id`, `notes`.
  2. Insert the `stock_transfer_items` rows.
  3. Call `rpc('complete_stock_transfer', { p_transfer_id })`.
- That RPC writes BOTH movements (negative at source, positive at destination).
  Do not write movements yourself.
- Below, list recent transfers: reference (`dir="ltr"`), from → to, status
  `Badge`, date.

### 3. Purchase orders — create and receive

The list exists. The create and receive flows do not.

**Create / edit** — a Modal or full form with:
- supplier (`Select` from `suppliers`), destination branch, expected date, notes
- line items: variant picker + `quantity_ordered` + `unit_cost`
- compute `subtotal` (sum of qty x cost), `shipping_cost`, and `total`
- unique `reference`, e.g. `` `PO-${Date.now()}` ``
- insert `purchase_orders`, then `purchase_order_items`

**Receive** — the existing button is currently inert. Wire it.
- Modal listing every line: quantity ordered, already received, and an input for
  how many are arriving now, capped at `quantity_ordered - quantity_received`.
- Then:
  ```ts
  import type { Json } from '@/lib/database.types'

  await supabase.rpc('receive_purchase_order', {
    p_po_id: po.id,
    p_lines: lines
      .filter(l => l.receivingNow > 0)
      .map(l => ({ item_id: l.id, quantity: l.receivingNow })) as unknown as Json,
  })
  ```
- That RPC writes the stock movements and recomputes the header status
  (`partially_received` / `received`). Do not touch inventory yourself.
- `invalidateQueries` on `['purchase_orders']`, `['inventory_levels']`,
  `['dashboard']`.

---

## Also

Grep your two files for `toast\.(success|error|info)\(\s*['"][A-Za-z]` and route
every one through `t()` with keys in both `en` and `ar`.

Use the **Edit** tool on `src/lib/translations.ts`, never Write.

## Gate

Run every gate command in `REMAINING_WORK.md`, plus:
```powershell
Get-ChildItem -Recurse src -Include *.tsx | Select-String -Pattern "set_stock|receive_purchase_order|complete_stock_transfer"
```
All three must appear with real line numbers.
