# Murlidhar Enterprise — Feature Inventory & Audit

> Read-only audit. No application code, configuration, packages or Firestore data were changed. This file is the only thing created.

**Audit date:** 2026-10-13 · **App:** `sales` v1.0.0 (Expo SDK 57, React Native 0.86, Firebase 12)

## How to read the evidence

| Label | Meaning |
|---|---|
| **Source-verified** | I read the implementing code (UI, data layer and rules) and traced the logic. |
| **Executed** | Something was actually run. Only one thing was: `npx tsc --noEmit` → **0 errors**. `npx expo lint` could **not** run (`Cannot find module 'eslint'`: ESLint is not installed). |
| **Not tested** | No browser session, device, Firestore emulator, rules unit test or live-data check was done. Nothing here is "browser-tested". Firestore rules were read, **not deployed or tested**. |

Status legend: ✅ Implemented · ◐ Partially implemented · ❔ Unverified · ⚠ Implemented but inconsistent/risky (see §8)

---

## 1. Executive summary

Murlidhar Enterprise is a single-business Expo Router app (web-first, runs on native too) backed by Firebase Auth and Firestore. It manages a godown's stock, salesman daily bills (Fillup / Add More / Return / Sold), direct "Private Bills", supplier receipts and payments, expenses, and an owner dashboard.

What is solid (source-verified):

- Every money- or stock-moving write is a **Firestore transaction or batch with an idempotency id**: receipts, private bills (create/edit/pay), supplier payments, stock given, bill finalization, same-day correction, expenses.
- **Stock model is coherent.** `products.stock` is the warehouse figure; `allocations/{productId}.outstanding` tracks units held by salesmen. Giving stock is *not* a sale; stock only leaves the warehouse when a Return is confirmed (Sold) or a Private Bill is saved. Free stock = `stock − outstanding`, and both Private Bills and Stock Given are refused beyond it.
- **Sales and commission come from Item Master values** copied onto each bill line, so historical bills are not repriced by later Item Master edits (with one exception, §8 #7).
- **Customer-specific last rates cannot leak** between customers: matching is by full 10-digit mobile, or by exact name only when neither bill has a mobile.
- **Owner / Employee separation** is enforced in the UI *and* in `firestore.rules` (Item Master, Users, Expenses, Reports are owner-only; the three employee permissions gate collections).

Main gaps:

1. **Date-basis inconsistency:** the Home dashboard counts a salesman bill on the day it was *finalized*; every list/analysis counts it on the bill's *own date* (§8 #1).
2. **Rules are not proven deployed** (no `.firebaserc`; `firebase.json` is rules-only) and cannot enforce stock arithmetic or finalized-bill immutability (§5, §8 #3–4).
3. **No automated tests**; lint is not runnable; no CSV/Excel export; printing is web-only.
4. Several **dead/legacy files** and a few **orphaned or preview-only screens** (Businesses, Statements page).
5. Operational gaps: no receipt cancel/edit, no manual stock adjustment, no way to create salesman *login* accounts from the app.

**Overall status: feature-complete for the daily workflow; ~85–90 % production-ready. Needs rule deployment verification, tests and the §8 items resolved before being called final.** (Percentage is my judgement, not a measured metric.)

---

## 2. Feature checklist (by module)

### 1. Authentication and User Management
- ✅ Email/password sign-in (Firebase Auth) — `src/app/login.tsx`, `src/auth/AuthContext.tsx`
- ✅ Role comes from `users/{uid}` profile, never from the client; unknown role / missing profile / inactive → signed straight back out
- ✅ Session persistence (IndexedDB on web, AsyncStorage on native) — `src/data/firebase/auth*.ts`
- ✅ Live profile listener: permission changes or deactivation apply immediately (data listeners restart; inactive → forced sign-out)
- ✅ Owner creates employee logins (secondary Firebase app so the owner stays signed in), edits name/permissions/active, sends password-reset email — `more/users.tsx`, `employee-auth.ts`
- ✅ Passwords never stored in Firestore
- ◐ **Salesman login accounts cannot be created in the app** (role `salesman` is seeded by `scripts/seed-users.js`; rules deny app-side creation of non-employee profiles)
- ◐ Owner account cannot be edited or created from the app (by design)
- ✅ No user deletion (`allow delete: if false`); deactivation only

### 2. Home Dashboard and Business Analytics (owner only)
- ✅ Period selector: Today / This Week (Mon→today) / This Month (1st→today) / Custom Range with validation — `src/app/(app)/index.tsx`
- ✅ KPIs: Turnover, Commission, Item count, Salesman count ("billed today")
- ✅ Financial row: Total Turnover, Paid to Parties, Expenses, Balance Remaining
- ✅ Stock overview counts (Healthy / Low / Out) and a "Stock Attention" list
- ✅ Recent Activity (latest 6: stock received, salesman bills finalized, private bills)
- ✅ Employees are redirected away from Home to their first permitted page
- ⚠ Date basis mismatch and balance definition (§8 #1, #2)

### 3. Stock and Inventory Management
- ✅ Warehouse stock list with status dot, search, filter (All/Healthy/Low/Out with live counts) — `stock/index.tsx`
- ✅ Two-table split layout on wide screens; single table on narrow
- ✅ Stock status rule `out ≤ 0`, `low ≤ minimumStock`, else healthy — `src/mock/stock-status.ts`
- ✅ Edit/delete product from Stock page (owner only; employees do not see Edit)
- ◐ **No manual stock adjustment / stock-take**: stock only moves via receipts, private bills, and confirmed salesman Sold
- ◐ Stock page shows total warehouse stock only; salesman-held units are not shown per product (they are included in the figure, and visible per salesman in Salesman Report / salesman portal)

### 4. Stock Receipts and Supplier Statements
- ✅ Add Stock mode: party name + 10-digit mobile, per-product quantities (+/−/typed), Review dialog (Old / New / Total) — `stock/index.tsx`
- ✅ Total Purchase Amount required (> 0); Paid Amount ≤ total; remaining + status shown live
- ✅ Atomic save: party upsert + ledger lines + stock increment + payment summary + first payment entry — `parties.ts#recordReceipt`
- ✅ Party identity = mobile number (doc id); name correctable (`renameParty`), number never changes
- ✅ Statement page grouped by party: receipts, units, purchase, paid, outstanding, last received; date range, search, party selector, payment-status chips — `stock/received.tsx`
- ✅ Per-receipt Payments dialog: record additional payments (never above remaining), history with running paid/remaining
- ✅ Legacy receipts (no amount): Paid/Unpaid toggle; excluded from monetary totals and flagged
- ✅ Receipts with unreliable mobile kept un-merged and flagged "check"
- ◐ No edit/cancel/reverse of a receipt (ledger is append-only by rule)

### 5. Salesman Management
- ✅ Add / edit salesman (name required, mobile) from the Salesmen page — `salesmen/index.tsx`
- ✅ "Delete" = archive (`active:false`); history retained
- ⚠ Archived salesman's held stock cannot be returned through the UI (§8 #6)

### 6. Salesman Bill Entry and Daily Stock Allocation
- ✅ One bill document per salesman per business date: `salesmen/{id}/dailyBills/{yyyy-mm-dd}`
- ✅ Bill Date picker (IST business date); guards against discarding unsaved entries on date change
- ✅ Fillup auto-carried from last **finalized** Return; Add More typed; Total = Fillup + Add More
- ✅ **Save Stock Given**: transactional, once per operation id, refused if more than free stock (stock − outstanding), multi-product shortage dialog — `giveStockTransaction`
- ✅ Stock-given audit trail on the bill (`stockGiven[]`) + append-only `activities` documents
- ✅ Returns typed are saved as drafts on blur (survive reload); live Sold/Amount/Commission preview after Enter
- ✅ "Return pending" banner for earlier unfinalized bills with one-click jump
- ✅ Future/past dates handled by explicit books-in-order rules (`salesmanBills`)

### 7. Returns, Sold Quantities, Commission and Bill Finalization
- ✅ Save Return → confirmation sheet showing Total Sold / Amount / Commission → Confirm Return finalizes (`finalizeCurrentBill` / `finalizeBill`)
- ✅ Validation: Return is a whole number, `0 ≤ Return ≤ Total`, every item must have a Return, earlier pending bill must be finalized first
- ✅ Finalization is one transaction: writes the bill, decrements `products.stock` by Sold, decrements `allocations.outstanding` by Sold; a finalized bill is never rewritten by this path (no double deduction)
- ✅ Return stays with the salesman and becomes next Fillup
- ✅ Saved totals on the bill: fillup, returned, sold, amount, commission

### 8. Salesman Bill Editing and Historical Records
- ✅ **List of Bill Entry**: finalized bills, filter by period/party, totals row, open a bill — `salesmen/previous.tsx`
- ✅ Bill detail (read-only) + Print + stock-given Activity Log (date range) — `activity-log.tsx`
- ✅ **Correction of a finalized bill**: edit Fillup, Add More, Return; stock moves by the *difference* in Sold; allocation adjusted; correction trail stored — `correctFinalizedSettlement`
- ✅ Correction refused if a later bill is finalized or has stock given (prevents corrupting dependants)
- ⚠ "Same-day" rule is UI-inconsistent and re-prices at current Item Master (§8 #7)
- ◐ **Statements page** (`/salesmen/statements`) works (per-salesman, date range, per-day print) but has **no menu link** (§8 #9)

### 9. Product Sales Analysis
- ✅ Period filter + multi-select Salesmen and Products — `salesmen/product-sales.tsx`, `data/product-sales.ts`
- ✅ Summary (units, amount, commission), Product Ranking, Salesman Comparison, tap-to-drill
- ✅ When filtered: Daily Breakdown and Bill History (capped at 300 lines; totals cover all)
- ✅ Uses saved unit values on each bill line; private bills excluded (stated on screen)

### 10. Private Bills and Direct Sales
- ✅ Add New Bill: customer name/mobile (both optional), per-product Qty + Rate, live totals — `private-bills.tsx`
- ✅ Atomic save: bill + first payment record + stock decrement; refused if > free stock — `saveDirectBillTransaction`
- ✅ Edit bill (customer, lines, qty, rate): net stock delta applied atomically, must fit free stock, total ≥ already paid — `editDirectBillTransaction`
- ✅ Statement list: period filter, search (name/mobile), status chips, sortable Date/Total/Remaining, totals row
- ✅ Bill view + Print (web)
- ✅ Separate from salesman bills in code, stock and reports
- ◐ No delete/cancel of a private bill

### 11. Customer-Specific Product Pricing
- ✅ Rate defaults to the customer's **last billed rate** for that product, else Item Master amount — `customerLastRates`
- ✅ Derived from saved bills only (no cache, no customer master); failed saves cannot become a "last rate"
- ✅ Typed rates are preserved when quantities change or the customer changes
- ✅ Customer suggestions (distinct, newest first)
- ✅ Matching rules prevent cross-customer leakage (§4.8)

### 12. Payment Tracking and Outstanding Balances
- ✅ Private bills: paid/remaining/status, append-only payment history with legacy-bill handling (`paymentHistory`)
- ✅ Supplier receipts: same model against `receiptPayments` + `receiptPaymentEntries`
- ✅ Both: payment cannot exceed remaining; idempotent per submission id; racing payments re-run against new balance
- ✅ Supplier payments and customer receipts are **separate collections and code paths**
- ◐ No cross-customer "total receivables" screen (only per-list totals); no customer ledger

### 13. Expense Management (owner only)
- ✅ Add / edit / delete expense (title, amount > 0, date, notes) — `more/expense.tsx`
- ✅ Period filter, title search, total row
- ✅ Idempotent create; separate collection; feeds Home "Total Expenses" and "Balance Remaining"
- ◐ Delete is a hard delete with no audit record

### 14. Item Master and Product Configuration (owner only)
- ✅ Add / edit item: name, amount, commission, minimum stock, opening stock (add only), serial position — `products.tsx`
- ✅ Re-ordering by serial with automatic re-sequencing; sortable columns; search
- ✅ Soft delete (`active:false`); re-adding a deleted name reactivates the old record
- ✅ Product id derived from the name (`productIdFor`); duplicate active names refused
- ✅ Owner-only enforced in repository (`ownerOnly()`) and rules

### 15. Reports, Search, Filters and Date Ranges
- ✅ Shared period filter (Today / Week / Month / Custom), all on IST business dates
- ✅ Reports (owner): Stock, Salesmen (this month), Commission (this month), Stock History — `more/reports/[type].tsx`
- ◐ Reports are **fixed to the current month / no filters**; Stock History has no date filter or search
- ✅ Search on Stock, Item Master, Expense, Private Bills, Parties, bill entry products

### 16. Printing and Exporting
- ✅ Salesman daily bill print (A4 portrait, two compact tables) and Private Bill print — `statement-print.web.tsx`
- ◐ **Web only**: native `printStatement` / `printPrivateBill` are no-ops
- ❌ No CSV/Excel/PDF export anywhere (grep for csv/xlsx: none)

### 17. Employee Permissions and Access Control
- ✅ Three independent flags: `stockAccess`, `privateBillsAccess`, `salesmenAccess`
- ✅ Route guards (`RequireAccess`), menu filtering, data-listener scoping, repository guards, and Firestore rules (see §5)
- ✅ Employees cannot reach Home, Item Master, Reports, Expense, Users, Businesses, Settings

### 18. Stock History, Activity Logs and Data Integrity
- ✅ Stock History report: Received / Private Bill / Salesman Sold / Sold Correction rows, each from its own source; corrections shown as separate rows so nothing double-counts — `derive.ts#movementRows`
- ✅ Activity log of stock given (per salesman)
- ✅ Dashboard Recent Activity
- ✅ Idempotency + transactions throughout (§7)
- ✅ Maintenance scripts: `rebuild-allocations.js`, `reconcile-stock.js`, `backfill-parties.js` (dry-run by default)
- ◐ Stock History omits payments, expenses and stock-given events by design

### 19. Technical Architecture and Integrations
- ✅ See §7
- ◐ No tests, no EAS/Hosting config, no CI

### Other
- ✅ Salesman portal (`/salesman`): own holdings and "My Stock" only
- ◐ Salesman cannot see their own bills/statements in the UI even though rules allow reading them
- ◐ **Businesses** screen is a visual preview only (data does not change per business) — `more/businesses.tsx`
- ◐ **Settings** shows business name, user count, "(prototype)" label, Manage Users, Logout

---

## 3. Detailed functionality and business rules

### 3.1 Warehouse stock vs. salesman-held stock
Source-verified (`derive.ts`, `settlements.ts`, `directBills.ts`).

- `products/{id}.stock` — the warehouse figure. Incremented by receipts, decremented by private bills and by confirmed **Sold**.
- `allocations/{id}.outstanding` — units currently with salesmen. Incremented by Save Stock Given, decremented by Sold on finalization.
- **Giving stock to a salesman does not change `products.stock`** (stock-given only raises `outstanding`). ✅ matches the stated rule.
- **Free stock = `stock − outstanding`.** Stock Given, Private Bill creation and Private Bill edit increases are all refused above it, checked *inside the transaction* from server values.
- A product with no counter document starts from `outstandingByProduct` (derived from saved bills).
- Not enforced by rules: that `outstanding` equals what salesmen actually hold (see §5).

### 3.2 Daily bill lifecycle
1. **Open**: `finalized:false`. Holds Add More (stock given). Fillup is *not stored* on an open bill; it is derived from the previous finalized Return.
2. **Return entered** (draft saved on blur) → **Save Return** → confirmation → **Confirm Return**: `finalized:true`, `status:'finalized'`, `totals` saved, Sold applied to stock and allocation.
3. **Correction** (§8 #7): rewrites the finalized document in place and applies only the *delta*.

A finalized bill is refused by `setSettlementWithStock` ("already finalized"), so confirming twice cannot deduct twice.

### 3.3 Sold, commission and sales amount follow Item Master
- `unitAmount` / `unitCommission` are copied from the Item Master onto each line when the line is built (`buildBill`) and again when the bill is finalized or corrected. Amount and commission are always `Sold × unit value on the line`, never recomputed from today's prices on read.
- Statements, Product Sales Analysis, List of Bill Entry and Dashboard all read the saved line values. ✅

### 3.4 Returns and corrections keep stock consistent
- Finalize: stock −= Sold; outstanding −= Sold.
- Correct: `Δsold = newSold − oldSold`; stock −= Δsold; outstanding += (Δ(fillup+addMore)) − Δsold. Refused if the extra Sold exceeds stock or newly given units exceed free stock.
- Repeating the same correction changes nothing (delta is computed against the stored bill; a correction-trail entry is added only when Sold changed).

### 3.5 Private Bills are separate
Stored in `directBills`; never read by Product Sales Analysis or Salesman statements; appear in Stock History as "Private Bill" and in Dashboard turnover as a separate additive component (`direct`). ✅

### 3.6 Supplier payments vs. sales receipts
Supplier: `receiptPayments` / `receiptPaymentEntries` (stock page). Customers: `directBills.paidAmount` / `directBillPayments` (private bills page). Different collections, validators and screens. ✅ The Dashboard uses *supplier payments* only (not customer receipts) — see §8 #2.

### 3.7 Idempotency
Every write takes a client-generated submission id that the UI reuses on retry until the payload changes (`useRef<{key,id}>`); the transaction no-ops if the id already exists. See §7.

### 3.8 Customer-specific last prices
`sameCustomer(bill, name, phone)`:
- Typed mobile has ≥ 10 digits → match bills with the same normalized last-10-digits (name ignored).
- Typed mobile is 1–9 digits → matches nobody.
- No mobile typed → match only bills that also have no mobile **and** identical name (case/space-insensitive).
- Nothing typed → matches nobody.

Rates are taken from the customer's *newest* matching bill that contains the product. Different customers never share a rate. ✅ (Two different people with the same name and no mobile are indistinguishable — documented limitation.)

### 3.9 Expenses
Separate `expenses` collection. Not linked to stock, purchases or bills. Owner-only by rules and UI. Dashboard sums by expense `date`.

### 3.10 Validation summary
| Input | Rule |
|---|---|
| Stock qty / Add More / Private qty | whole number > 0 (Add More may be 0 in the grid) |
| Return | whole number, 0 ≤ Return ≤ Total |
| Party mobile | exactly 10 digits |
| Total Purchase Amount | > 0; Paid ≥ 0 and ≤ total |
| Private bill paid | ≥ 0, ≤ total; rates ≥ 0 |
| Payment | > 0 and ≤ remaining |
| Expense | title non-empty (≤200), amount > 0, real date, notes ≤1000 (rules) |
| Product | name non-empty, amount/commission ≥ 0, min stock integer ≥ 0 |
| Employee | name, email format, password ≥ 8 chars, unique email |

---

## 4. Calculation reference

All sources are cited; "unverified" is used where I could not confirm.

| # | Quantity | Formula | Source |
|---|---|---|---|
| 4.1 | **Fillup** (bill D) | `Return` of the latest **finalized** bill with `statementDay < D` (only lines with Return > 0; else 0) | `derive.ts#salesmanBills` |
| 4.2 | **Add More** | Σ stock given on that bill (`stockGiven[].items`) | `settlements.ts#giveStockTransaction` |
| 4.3 | **Total** | `Fillup + Add More` | `repository.ts#buildBill` |
| 4.4 | **Sold** | `Total − Return` (0 until finalized) | `repository.ts#buildBill` |
| 4.5 | **Sales amount** (line) | `Sold × unitAmount` (Item Master amount copied to the line) | `derive.ts#billTotals` |
| 4.6 | **Commission** (line) | `Sold × unitCommission` | `derive.ts#billTotals` |
| 4.7 | Bill totals | `sold = ΣSold`, `amount = Σ(Sold×unitAmount)`, `commission = Σ(Sold×unitCommission)`; `fillup` total = ΣTotal, `returned` = ΣReturn | `repository.ts#withSummary` |
| 4.8 | **Warehouse stock** | `products.stock` = opening + Σreceipts − Σprivate-bill qty − ΣSold (± correction deltas). Legacy receipts without `stockApplied` are added on read. | `derive.ts#warehouseStock` |
| 4.9 | **Outstanding with salesmen** | `allocations.outstanding`: `+= given` at Save Stock Given; `−= Sold` at finalize; correction `+= Δ(fillup+addMore) − ΔSold`. Seed value when absent: per salesman, latest finalized Return + stock given on later unfinalized bills | `settlements.ts`, `derive.ts#outstandingByProduct` |
| 4.10 | **Free (givable/sellable) stock** | `max(0, stock − outstanding)` | `settlements.ts`, `directBills.ts` |
| 4.11 | **Salesman holding (display)** | Total (`Fillup + Add More`) of the current open bill | `derive.ts#salesmanHolding` |
| 4.12 | **Private line total** | `round2(qty × rate)` | `repository.ts#saveDirectBill` |
| 4.13 | **Private bill total** | `round2(Σ line totals)` | same |
| 4.14 | **Private payment** | `remaining = round2(max(0, total − paid))`; status `paid` if `total>0 ∧ remaining=0`, `partial` if `paid>0`, else `unpaid`; payment ≤ remaining | `repository.ts#paymentOf`, `directBills.ts` |
| 4.15 | **Private edit** | per product `Δ = newQty − oldQty`; `stock −= Δ`; `Δ>0` must be ≤ free stock; `total ≥ paid`; `remaining = total − paid` | `directBills.ts#editDirectBillTransaction` |
| 4.16 | **Supplier receipt** | `remaining = total − paid`; status as above; additional payment ≤ remaining | `parties.ts`, `receiptPayments.ts` |
| 4.17 | **Party totals** | `purchase = ΣtotalAmount`, `paid = ΣpaidAmount`, `outstanding = Σremaining`, over receipts that **have** an amount only | `stock/received.tsx#group` |
| 4.18 | **Expense total** | `round2(Σ amount)` for `date ∈ [from,to]` | `derive.ts#expensesBetween` |
| 4.19 | **Dashboard Turnover** | `Σ_{finalized bills with IST-date(finalizedAt) ∈ range} Σ(Sold×unitAmount)` **+** `Σ_{directBills with date ∈ range} total` | `derive.ts#salesTotalsBetween` |
| 4.20 | **Dashboard Commission** | `Σ Sold×unitCommission` over the same finalized bills (private bills carry no commission) | same |
| 4.21 | **Dashboard Paid to Parties** | `round2(Σ receiptPaymentEntries.amount)` with IST-date(`at`) ∈ range | `derive.ts#supplierPaidBetween` |
| 4.22 | **Dashboard Total Expenses** | §4.18 | |
| 4.23 | **Dashboard Balance Remaining** | `round2(Turnover − Paid to Parties − Expenses)` (may be negative; shown with a minus) | `index.tsx` |
| 4.24 | Stock status | `out: stock ≤ 0`; `low: stock ≤ minimumStock`; else `healthy` | `mock/stock-status.ts` |
| 4.25 | Week / Month | Week = Monday of current IST week → today. Month = 1st → today | `index.tsx`, `period-filter.tsx` |

Notes:
- Commission is **not** subtracted in the Dashboard balance (§8 #2). Whether that is intended is a business question — unverified.
- Customer *receipts* (private-bill payments) are not part of any dashboard figure; Turnover uses **billed** totals.

---

## 5. Role and permission matrix

Frontend = UI/route/repository checks (`src/auth/access.ts`, `require-access.tsx`, `repository.ts`). Rules = `firestore.rules` as written in the repo. **Rules deployment is unverified** (no `.firebaserc`; I did not and could not check the live project).

| Capability | Owner | Employee (flag) | Salesman | Frontend | Rules |
|---|---|---|---|---|---|
| Sign in / active profile required | ✅ | ✅ | ✅ | ✅ | ✅ |
| Home dashboard | ✅ | ❌ (redirect) | ❌ | ✅ | n/a (data scoped) |
| Item Master (create/edit/reorder/delete) | ✅ | ❌ | ❌ | ✅ `ownerOnly()` | ✅ `isOwner` |
| Read products | ✅ | any page flag | active only | ✅ | ✅ |
| Change `products.stock` | ✅ | any page flag (stock-only diff, ≥ 0) | ❌ | via workflows | ✅ but **no arithmetic check** |
| Stock page / receipts / parties / supplier payments | ✅ | `stockAccess` | ❌ | ✅ | ✅ |
| Private Bills (create/edit/pay/print) | ✅ | `privateBillsAccess` | ❌ | ✅ | ✅ |
| Salesmen (master, bills, stock given, corrections, statements, analysis) | ✅ | `salesmenAccess` | ❌ | ✅ | ✅ |
| Own holdings / "My Stock" | – | – | ✅ | ✅ | ✅ own record + own `dailyBills` only |
| Reports, Expense, Users, Businesses, Settings | ✅ | ❌ | ❌ | ✅ owner guard on `/more` | Expenses ✅ owner; users ✅ owner |
| Create/edit employee profiles | ✅ | ❌ | ❌ | ✅ | ✅ (employee role only, whitelisted keys) |
| Edit own profile / escalate | ❌ | ❌ | ❌ | – | ✅ denied (`allow update` owner-only) |
| Delete any business document | ❌ | ❌ | ❌ | – | ✅ `delete: false` (except expenses: owner) |
| `allocations` write | ✅ | `salesmenAccess` | ❌ | workflows | ✅ (value ≥ 0, keys whitelisted) |

### Enforced only in the frontend (not in rules)
- A **finalized bill is not edited by the normal path** — rules allow `update` on `dailyBills` for anyone with `salesmenAccess` without checking `finalized`. Only the app's code prevents rewriting.
- Stock-given, Sold, and correction **arithmetic**; `outstanding` = actual holdings; "no later dependent bill" check.
- Employee's inability to see prices is UI-only for Item Master reads: employees *can read* `products` (including amount/commission) by rule — they just cannot change them. The Users form text says "never prices or commissions" about *editing*.
- `deleteSalesman` / `saveSalesman` have no owner check; any user with `salesmenAccess` may add, edit or archive salesmen (consistent with rules).
- Date/IST correctness of business dates.

### Rule gaps / residual trust (acknowledged in the rules file)
- Any employee with **any** page flag can set any product's stock to any value ≥ 0 (`stockOnlyChange`).
- Any employee with `salesmenAccess` can write any allocation counter or rewrite any finalized bill.
- `directBills` create does not verify stock; atomicity relies on the client transaction.
- Salesman role cannot be created by the app, only by script.

---

## 6. Route and source-file reference

| Route | Screen | Access | Main files |
|---|---|---|---|
| `/login` | Sign in | public | `src/app/login.tsx` |
| `/` | Home dashboard | owner | `(app)/index.tsx`, `data/derive.ts` |
| `/stock` | Stock + Add Stock + Edit item | `stockAccess` (edit = owner) | `(app)/stock/index.tsx`, `quantity-control.tsx`, `mock/give.ts` |
| `/stock/received` | Stock Statement (suppliers) | `stockAccess` | `(app)/stock/received.tsx`, `bill-grid.tsx`, `payment-status.tsx` |
| `/stock/receive`, `/stock/[id]` | redirects to `/stock` | `stockAccess` | |
| `/private-bills` | Private Bill (new / statement / view / edit / pay / print) | `privateBillsAccess` | `(app)/private-bills.tsx`, `directBills.ts`, `statement-print.web.tsx` |
| `/salesmen` | Add New Bill Entry | `salesmenAccess` | `salesmen/index.tsx`, `salesman-bills.tsx`, `bill-entry.tsx`, `open-bill.tsx`, `edit-bill.tsx`, `stock-limit-dialog.tsx`, `settlements.ts` |
| `/salesmen/previous` | List of Bill Entry (+ bill detail via query) | `salesmenAccess` | `salesmen/previous.tsx`, `day-bill.tsx`, `activity-log.tsx` |
| `/salesmen/product-sales` | Product Sales Analysis | `salesmenAccess` | `salesmen/product-sales.tsx`, `data/product-sales.ts` |
| `/salesmen/statements` | Salesman Statements | `salesmenAccess` | `salesmen/statements.tsx`, `data/statements.ts` — **no menu link** |
| `/salesmen/form`, `/salesmen/[id]`, `/bills` | redirects | | |
| `/products` | Item Master | owner | `(app)/products.tsx`, `repositories/products.ts` |
| `/more/reports`, `/more/reports/[type]` | Reports (stock, salesmen, commission, movement) | owner | `more/reports/*` |
| `/more/expense` | Expense | owner | `more/expense.tsx`, `repositories/expenses.ts` |
| `/more/users` | Users | owner | `more/users.tsx`, `employee-auth.ts`, `repositories/users.ts` |
| `/more/businesses` | Businesses (preview only) | owner | `more/businesses.tsx`, `mock/data.ts` |
| `/more/settings` | Settings | owner | `more/settings.tsx` |
| `/more/products`, `product-form`, `product-detail`, `user-form`, `/more` | redirects | owner | |
| `/salesman` | Salesman home (holdings) | salesman | `src/app/salesman/index.tsx` |
| `/salesman/stock` | My Stock | salesman | `src/app/salesman/stock.tsx` |

Navigation (`components/app-nav.tsx`): top header on wide screens (breakpoint 720 px), bottom nav on phones; "Salesman Master" dropdown (Add New Bill Entry / List of Bill Entry / Product Sales Analysis); "More" dropdown (Reports, Expense, Users, Businesses, Settings, Logout).

Key shared components: `page.tsx` (Page/SimpleTable), `controls.tsx` (theme, Btn, TextField), `bill-grid.tsx`, `period-filter.tsx`, `popover.tsx`, `sheet.tsx`, `split-bill.tsx` (two-up layout), `fixed-bar(.web).tsx`, `date-field(.web).tsx`, `data-gate.tsx`, `require-access.tsx`.

---

## 7. Technical architecture summary

**Stack:** Expo ~57, React 19.2, React Native 0.86 + react-native-web, Expo Router ~57 (typed routes, React Compiler on), TypeScript ~6 (`strict`), Firebase JS SDK ^12 (Auth + Firestore), AsyncStorage, Reanimated/Gesture Handler/Screens/Safe-area, `@expo/ui`. Dev: `firebase-admin` (scripts only). No state library: a custom `useSyncExternalStore` store.

**Layering:** screens → hooks/commands in `src/data/repository.ts` (the only boundary) → `src/data/firebase/repositories/*` (Firestore) ; pure derivations in `derive.ts`, `statements.ts`, `product-sales.ts`; business dates in `business-date.ts` (Asia/Kolkata, never the device clock).

**Data flow:** `db/database.ts` keeps an in-memory copy filled by live listeners chosen by role/permission (owner = all, employee = only permitted collections, salesman = own). The UI reads this copy; commands write to Firestore and the listeners deliver the result. Web has a persistent IndexedDB cache with multi-tab manager.

**Firestore collections**
```
users/{uid}                               role, active, permissions, salesmanId
products/{id}                             name, amount, commission, minimumStock, stock, serial, active
salesmen/{id}                             name, phone, active
  dailyBills/{yyyy-mm-dd}                 lines[], finalized, stockGiven[], corrections[], totals
  activities/{opId_productId}             STOCK_GIVEN (append-only)
allocations/{productId}                   outstanding
transactions/{date}                       container {date}
  entries/{id}                            RECEIVE_STOCK ledger (append-only)
parties/{mobile}                          name, mobile
receiptPayments/{receiptId}               totalAmount, paidAmount, status (+ legacy paid flag)
receiptPaymentEntries/{id}                supplier payments (append-only)
directBills/{id}                          private bills
directBillPayments/{id}                   customer payments (append-only)
expenses/{id}                             owner only
returns/{id}                              LEGACY, owner read-only
```

**Transaction / idempotency mechanisms (source-verified)**
| Operation | Mechanism |
|---|---|
| Receive stock | `runTransaction`; `receiptPayments/{receiptId}` existence = already applied; line ids `receiptId_productId` |
| Save Stock Given | transaction; `stockGiven[].id` checked; activity ids `op_product` |
| Confirm Return | transaction; refuses already-finalized; stock + allocation + bill together |
| Correct bill | transaction; delta against stored bill; correction id `corr_<updatedAt>` |
| Private bill create | transaction; bill id = submission id; existing → no-op |
| Private bill edit | transaction; `lastEditId` |
| Private/supplier payment | transaction; payment id = submission id; summary + entry together |
| Expense create | transaction; id = submission id |
| Product/employee/salesman/party writes | `writeBatch`/`setDoc` (not idempotent-by-id, last write wins) wrapped in `settle()` (8 s timeout treats a queued offline write as saved) |

**Quality**
- TypeScript: `npx tsc --noEmit` → pass (executed). `src/data/db/seed.ts` and `storage.ts` are **excluded** from tsconfig because they no longer compile.
- Lint: config present (`eslint.config.js`) but `eslint` is not a dependency; `expo lint` fails to start.
- Tests: **none** (no test files, no runner).
- Web deployment: `app.json` → `web.output: "static"`; a `dist/` export exists locally. **No hosting config** (`firebase.json` has only `firestore.rules`; no `.firebaserc`, no `eas.json`, no CI).
- Firebase web config is hard-coded in `config/firebase.ts` (public client identifiers; not reproduced here). The project id looks like a **test** project, and the scripts default to it. `serviceAccountKey.json` exists on disk in the project root; it is git-ignored and untracked (contents not read).
- Maintenance scripts (`scripts/`): `seed-*` (dev only), `rebuild-allocations`, `reconcile-stock`, `backfill-parties` (all dry-run unless `--apply`). Not executed.

---

## 8. Incomplete, unverified or potentially inconsistent

Ordered by my estimate of impact.

1. **Dashboard vs. lists use different dates for the same bill.** Dashboard (`salesTotalsBetween`) and Stock History date a salesman bill by `finalizedAt`; List of Bill Entry, Statements, Product Sales and Reports date it by `statementDay`. A bill for 10 Oct confirmed on 11 Oct counts in 11 Oct's dashboard but 10 Oct's list. Because Return is usually entered the next day, **daily dashboard turnover will routinely differ from the daily list total.** Which is intended is a business decision. *(Source-verified; not run.)*
2. **Balance Remaining definition.** `Turnover − Paid to Parties − Expenses` mixes *billed* turnover (including unpaid private bills) with *cash* paid out, and ignores salesman commission and customer collections. If "remaining balance" should mean cash in hand or profit, the formula is incomplete. *(Unverified against the owner's intent.)*
3. **Rules are unproven in production.** No `.firebaserc`; cannot confirm `firestore.rules` is deployed. If the project still uses test-mode rules, all frontend role checks are bypassable.
4. **Rules cannot enforce finalized-bill immutability or stock arithmetic** (acknowledged in the file). A user with `salesmenAccess` or any stock-capable role can write inconsistent numbers directly.
5. **Orphaned/legacy code:** `db/seed.ts` (contains demo credentials — not reproduced), `db/storage.ts`, unused `components/stock-filters.tsx`, a `src/mock/` folder that actually holds live logic (`stock-status.ts`, `give.ts`, `data.ts`), legacy `returns` rule, stale `seed-ledger.js` comments ("stock is never stored"), default Expo `README.md`, `scripts/reset-project.js`. Harmless but confusing.
6. **Archived salesman holding stock.** `outstandingByProduct` still counts archived salesmen's bills, but `useSalesmen` hides them, so their pending Return cannot be entered via the UI and their units stay "outstanding" (reducing free stock). `deleteSalesman` does not check for open holdings.
7. **Correction rules are looser than documented.**
   - Documented as "today's bill only". The List-of-Bill-Entry detail shows *Edit Bill* only when `date === today`, but `BillEntry` on the Add-New-Bill page offers it for **any finalized bill with no later dependants**, and `correctTodayBill(day)` accepts any day.
   - A correction re-prices the whole bill at **current** Item Master amount/commission (`correctTodayBill` overwrites `unitAmount/unitCommission` with the master's). Correcting an older bill after a price change silently changes its historical value.
8. **Statements column label.** In `salesmen/statements.tsx` the column headed "Fillup" displays `Total` (Fillup + Add More). The print uses "Fl. Prd." similarly. Likely intentional (holding) but easy to misread.
9. **Statements page has no navigation entry** (reachable only by URL or the back link from List of Bill Entry). Either link it or remove it.
10. **Missing workflows:** cancel/reverse a stock receipt; manual stock adjustment; delete/cancel a private bill; audit trail for expense edits/deletes; customer ledger/receivables view; salesman-account creation in-app; salesman self-service view of their bills (rules permit it, UI absent).
11. **Reports are minimal:** fixed to current month, no date filter on Stock History, no export. Salesman Report's "Holding Now" is the open bill's Total and may differ from `allocations` if a pending bill exists.
12. **Printing is web-only**; native is a no-op.
13. **`settle()` 8-second timeout** treats an unconfirmed non-transaction write (product/employee/salesman/party/receipt-paid) as saved; if the network is down it appears saved locally. Transactions are not affected.
14. **No tests, lint not installed.** All behaviour above is from reading code; regressions will not be caught automatically.
15. **Preview/prototype surfaces:** Businesses switch (no data effect), Settings "(prototype)" label, app name `sales`.
16. **Employee data visibility:** employees can read product prices/commissions through rules (UI hides them on pages they cannot open). If prices must be hidden from employees at the data level, rules need a change.
17. **Minor:** `statements.tsx#thisMonth` uses the device's `new Date()` for the last day of month (all other date logic uses IST); `presetRange('week')` is "last 7 days" whereas the dashboard/lists use Monday→today.

---

## 9. Final overall implementation status

| Area | Status |
|---|---|
| Auth & roles | ✅ Complete (salesman account creation external) |
| Stock, receipts, suppliers | ✅ Complete; ◐ no reversal/adjustment |
| Salesman bills (give / return / finalize / correct) | ✅ Complete; ⚠ date/price rules in §8 #1, #7 |
| Private bills, pricing, payments | ✅ Complete; ◐ no cancel |
| Expenses | ✅ Complete |
| Item Master | ✅ Complete |
| Dashboard & reports | ◐ Works; definitions need owner sign-off (§8 #1, #2, #11) |
| Printing/export | ◐ Web print only, no export |
| Security rules | ◐ Written and sensible; **deployment unverified** |
| Quality tooling | ❌ No tests, lint unrunnable |

**Overall: Substantially complete and internally well-engineered for its core accounting flows, but not yet "finalized" in the sense of verified. Recommended before sign-off: (1) confirm rules are deployed, (2) decide the dashboard date basis and balance formula, (3) tighten/clarify the correction rule and re-pricing, (4) add emulator-based rules and transaction tests, (5) clean up legacy files.**

*Nothing in this document was verified by running the app in a browser or on a device.*
