# P9 — Reports + Cash & Shifts

Read `docs/REMAINING_WORK.md` and `docs/BUILD_SPEC.md` first.

**Files you own:** `src/admin/pages/ReportsPage.tsx`,
`src/admin/pages/CashPage.tsx`, a new `src/admin/reports/` folder, and
`src/lib/translations.ts` (Edit only).

Both pages are currently `comingSoon` placeholders.

---

## A. Reports

Guard with `useCan()('reports')`. Organise with `Tabs`.

A shared date-range control at the top (presets: today, last 7, last 30, this
month, last month, custom) plus a branch filter. Every tab respects both.

**Tab 1 — Sales**
- From `v_daily_sales`: revenue over time (Recharts line/area), split by
  channel. Totals row: orders, gross revenue, discounts, refunds, net revenue,
  average order value.
- RTL: `reversed={isRTL}` on `<XAxis>`, `orientation={isRTL ? 'right' : 'left'}`
  on `<YAxis>`, and format ticks and tooltips with `formatMoney`/`formatNumber`
  for the active locale.

**Tab 2 — Products & profit**
- From `v_product_performance`: table of product, units sold, revenue, cost,
  **profit**, margin %, units returned. Sortable by each column.
- Highlight negative-margin rows in `danger` — that means the cost price is
  above the selling price and the owner is losing money per unit.
- Note: profit is only meaningful where `cost_price` has been filled in. Show a
  small hint if many products have `cost_price = 0`.

**Tab 3 — Busiest times**
- From `v_sales_by_hour`: a day-of-week x hour-of-day heatmap. `day_of_week` is
  Postgres `extract(dow)` — 0 = Sunday. Label days in the active locale.
  Colour intensity by revenue. This tells the owner when to roster staff.

**Tab 4 — Staff performance**
- From `v_staff_sales`: sales per cashier per day — orders, revenue, average
  sale. Leaderboard for the selected range.

**Tab 5 — Inventory**
- From `v_inventory_valuation`: stock value at cost and at retail per branch.
- Slow movers: products with `total_sold = 0` or no sale in the range, and their
  tied-up stock value. Dead stock is the thing a clothing shop most needs to see.

**Export** — a CSV download button per tab. Build the CSV in the browser from
the already-fetched rows (no new dependency): join with `,`, quote fields
containing commas or quotes, prepend a UTF-8 BOM (`﻿`) so Excel renders
Arabic correctly, and trigger via a `Blob` + object URL.

---

## B. Cash & Shifts

Guard with `useCan()('cash')`. This is the module the owner uses to check
nobody is stealing, so it must be precise.

**Current shift panel** — per branch:
- If none open: an "Open shift" action asking for the opening float, calling
  `rpc('open_shift', { p_location_id, p_opening_float })`.
- If open: who opened it, when, opening float, and live expected cash from
  `rpc('shift_expected_cash', { p_shift_id })`.
- **Pay in / pay out**: amount + reason, calling
  `rpc('record_cash_movement', { p_shift_id, p_type, p_amount, p_reason })`
  where `p_type` is `'pay_in'` or `'pay_out'`. The RPC rejects any other type
  and requires a positive amount — it applies the sign itself.
- **Close shift**: ask for the counted cash, show expected alongside it, and
  display the variance (`counted - expected`) prominently before confirming.
  Then `rpc('close_shift', { p_shift_id, p_counted_cash, p_notes })`.
  Colour the variance: `success` at 0, `warning` under ~50 EGP either way,
  `danger` beyond that.

**Shift history** — closed shifts with branch, opened/closed by, times, opening
float, expected, counted, variance. Variance coloured. Click to expand the full
`cash_movements` ledger for that shift: type `Badge`, amount (signed, coloured),
reason, linked order number where `order_id` is set, time.

**Expenses**
- List from `expenses`: date, category, amount, note, branch, who recorded it,
  and whether it came out of the drawer.
- Add: category (rent, salaries, supplies, utilities, other), amount, note,
  date, branch, and a `paid_from_drawer` checkbox. Insert directly into
  `expenses` — a trigger automatically writes the matching negative
  `cash_movements` row when `paid_from_drawer` is true and a `shift_id` is set,
  so **do not write that cash movement yourself** or it will be double-counted.
- Only managers may edit or delete an expense (the RLS policies enforce this);
  any staff member may add one.

**Daily cash summary (Z-report)** — for a chosen day and branch: opening float,
cash sales, refunds, pay-ins, pay-outs, expenses, expected close, counted,
variance. Printable via `window.print()` with an `@media print` rule so only the
report prints.

---

## Gate

Every gate command in `REMAINING_WORK.md`, plus:
```powershell
Get-ChildItem -Recurse src -Include *.tsx | Select-String -Pattern "open_shift|close_shift|record_cash_movement|shift_expected_cash"
```
All four must appear with real line numbers.
