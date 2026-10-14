import type { WriteBatch } from 'firebase/firestore';
import { useMemo } from 'react';

import { getActiveProfile, getDatabase, useDatabase } from './db/database';
import type { DirectBill, DirectBillLine, Expense, DirectBillPayment, PaymentStatus, ReceiptPaymentEntry, Permissions, Product, ReceiveStockTx, Salesman, Settlement, SettlementLine, UserProfile } from './db/schema';
import { billTotals, movementRows, outstandingByProduct, recentActivity, salesmanBills, salesmanHolding, warehouseStock, type ActivityItem, type BillState, type MovementRow, type OpenBillRow, type StockMap } from './derive';
import { auth } from './firebase/auth';
import { friendlyError, settle } from './firebase/errors';
import { createExpenseTransaction, deleteExpenseDoc, updateExpenseDoc } from './firebase/repositories/expenses';
import { EditRefused, NotEnoughStockForBill, PaymentRefused, editDirectBillTransaction, recordDirectBillPaymentTransaction, saveDirectBillTransaction } from './firebase/repositories/directBills';
import { recordReceipt, writePartyName } from './firebase/repositories/parties';
import { businessDate } from './business-date';
import { ReceiptPaymentRefused, recordReceiptPaymentTransaction, writeReceiptPaid } from './firebase/repositories/receiptPayments';
import { OpeningStockRefused, batchAdjustStock, batchCreateProduct, batchSetSerial, batchUpdateProduct, newBatch, productIdFor, initializeOpeningStockTransaction } from './firebase/repositories/products';
import { createLogin, isEmailInUse, sendReset } from './firebase/employee-auth';
import { updateEmployeeProfile, writeEmployeeProfile } from './firebase/repositories/users';
import { archiveSalesman, writeSalesman } from './firebase/repositories/salesmen';
import { type Shortage, correctFinalizedSettlement, getActivities, getFinalizedBills, giveStockTransaction, type Activity, NotEnoughStock, setSettlementWithStock, settlementId } from './firebase/repositories/settlements';
import { runInitialization } from './opening-stock';
import { correctionUnitValues } from './correction-pricing';
import { buildStatement, localDate, todayISO, type Statement } from './statements';

export type { ActivityItem, BillState, OpenBillRow, StockMap } from './derive';
export type { DirectBill, DirectBillLine, Product, Salesman, UserProfile } from './db/schema';

// ─── The data boundary ──────────────────────────────────────────────────────────────────────────
// Screens read through the hooks and change data through the commands in this file only. Nothing
// outside src/data touches Firestore or the data shape. Commands check the rules of the business
// against the data already loaded, then write to Firestore; the live listeners deliver the result.

export type { Shortage };
export type Item = { id: string; qty: number };
/** `limit` marks a refusal because a quantity is more than the stock allows (as opposed to a failed save). */
export type Result = { ok: true } | { ok: false; error: string; limit?: boolean; /** Products that do not fit the allocatable stock (Save Stock Given). */ shortages?: Shortage[] };

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const actor = () => auth.currentUser?.uid ?? 'unknown';
const whole = (n: number) => Number.isInteger(n) && n > 0;

const BAD_ITEMS: Result = { ok: false, error: 'Enter a whole quantity above 0 for every product.' };
const overLimit = (error: string): Result => ({ ok: false, error, limit: true });

/** Sends a batch and turns any failure into a displayable message. */
async function commit(batch: WriteBatch, fallback: string): Promise<Result> {
  try {
    await settle(batch.commit());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, fallback) };
  }
}

// ─── Queries ───────────────────────────────────────────────────────────────────────────────────

/** Current products (non-hook snapshot, for helpers that cannot use hooks). */
export const getProducts = (): Product[] => getDatabase().products.filter((p) => p.active);

export function useProducts(): Product[] {
  const db = useDatabase();
  return useMemo(() => db.products.filter((p) => p.active), [db]);
}

/** Every product, including deactivated ones (the Products page, where the owner can reactivate them). */
export function useAllProducts(): Product[] {
  const db = useDatabase();
  return db.products;
}

/** id → product, for looking names up. */
export function useProductIndex(): Map<string, Product> {
  const products = useProducts();
  return useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
}

export type ProductWithStock = Product & { stock: number };

/** Item Master joined with current warehouse stock (the Stock page). */
export function useProductsWithStock(): ProductWithStock[] {
  const db = useDatabase();
  return useMemo(() => {
    const stock = warehouseStock(db);
    return db.products.filter((p) => p.active).map((p) => ({ ...p, stock: stock[p.id] ?? 0 }));
  }, [db]);
}

export function useSalesmen(): Salesman[] {
  const db = useDatabase();
  return useMemo(() => db.salesmen.filter((s) => s.active), [db]);
}

export function useSalesman(id: string | undefined): Salesman | undefined {
  return useSalesmen().find((s) => s.id === id);
}

/** Owner only: every user profile (empty for a salesman, who cannot read them). */
export function useUsers(): UserProfile[] {
  return useDatabase().users;
}

/** Warehouse (master) stock per product id. */
export function useStocks(): StockMap {
  const db = useDatabase();
  return useMemo(() => warehouseStock(db), [db]);
}

/** Goods carried by each salesman: salesmanId → productId → quantity (the Total on their open bill). */
export function useSalesmanStock(): Record<string, StockMap> {
  const db = useDatabase();
  return useMemo(() => Object.fromEntries(db.salesmen.map((s) => [s.id, salesmanHolding(db, s.id, todayISO())])), [db]);
}

/** One salesman's current holding: the Total on their open bill. */
export function useHolding(salesmanId: string): StockMap {
  const db = useDatabase();
  return useMemo(() => salesmanHolding(db, salesmanId, todayISO()), [db, salesmanId]);
}

/** The items the salesman carries (the open bill's Total), in catalogue order. */
export function useHeldProducts(salesmanId: string): { product: Product; qty: number }[] {
  const db = useDatabase();
  return useMemo(() => {
    const holding = salesmanHolding(db, salesmanId, todayISO());
    return db.products.filter((p) => p.active && (holding[p.id] ?? 0) > 0).map((p) => ({ product: p, qty: holding[p.id] ?? 0 }));
  }, [db, salesmanId]);
}

/** The salesman's two live bills: today's (Fillup / Add More) and, if any, the earlier one waiting for its Return. */
export function useBills(salesmanId: string, day?: string): { current: BillState; pending: BillState | null } {
  const db = useDatabase();
  return useMemo(() => salesmanBills(db, salesmanId, todayISO(), day), [db, salesmanId, day]);
}

export function useRecentActivity(limit: number): ActivityItem[] {
  const db = useDatabase();
  return useMemo(() => recentActivity(db, limit), [db, limit]);
}

/** Every direct (private) bill, newest first. */
export function useDirectBills(): DirectBill[] {
  return useDatabase().directBills;
}

/** One stock receipt: everything received from a party at one time. */
export type Receipt = {
  id: string;
  at: string;
  partyName: string;
  partyPhone: string;
  /** The party this receipt belongs to (its mobile number); null when the receipt has no reliable mobile number and needs a manual look. */
  partyId: string | null;
  /** Fully paid. For an older receipt (no purchase amount) this is the old Paid / Unpaid switch. */
  paid: boolean;
  /** Purchase amount of this receipt; null for older receipts, whose price was never recorded (it is not guessed). */
  totalAmount: number | null;
  /** Paid so far; 0 when no amount was recorded. */
  paidAmount: number;
  /** Total − paid; null when no amount was recorded. */
  remainingAmount: number | null;
  status: PaymentStatus;
  lines: { name: string; qty: number }[];
  units: number;
};

/** Every stock receipt (opening stock excluded), newest first. The Stock Receive statement groups these by party. */
export function useReceipts(): Receipt[] {
  const db = useDatabase();
  return useMemo(() => {
    const name = new Map(db.products.map((p) => [p.id, p.name]));
    const summary = new Map(db.receiptPayments.map((p) => [p.id, p]));
    const out = new Map<string, Receipt>();
    for (const t of db.transactions) {
      if (t.note === 'Opening stock') continue;
      const id = t.receiptId ?? `${t.at}|${t.userId}`;
      // Older receipts have no partyId: one is taken from the saved number only when it is a clean 10-digit mobile (spaces/hyphens ignored); otherwise it stays null, never merged.
      const legacy = validMobile((t.partyPhone ?? '').replace(/[\s-]/g, ''));
      const s = summary.get(id);
      const amounts = typeof s?.totalAmount === 'number' ? paymentOf(s.totalAmount, s.paidAmount ?? 0) : null;
      const r =
        out.get(id) ??
        ({
          id,
          at: t.at,
          partyName: t.partyName ?? '',
          partyPhone: t.partyPhone ?? '',
          partyId: t.partyId ?? legacy,
          paid: amounts ? amounts.status === 'paid' : s?.paid === true,
          totalAmount: amounts ? (s?.totalAmount as number) : null,
          paidAmount: amounts?.paid ?? 0,
          remainingAmount: amounts ? amounts.remaining : null,
          status: amounts ? amounts.status : s?.paid === true ? 'paid' : 'unpaid',
          lines: [],
          units: 0,
        } satisfies Receipt);
      r.lines.push({ name: name.get(t.productId) ?? t.productId, qty: t.qty });
      r.units += t.qty;
      out.set(id, r);
    }
    return [...out.values()].sort((a, b) => b.at.localeCompare(a.at));
  }, [db]);
}

/** Every warehouse stock movement, newest first (the Stock History report). See movementRows. */
export type { MovementRow } from './derive';
export function useMovementRows(): MovementRow[] {
  const db = useDatabase();
  return useMemo(() => movementRows(db), [db]);
}

// ─── Item Master ───────────────────────────────────────────────────────────────────────────────

const validProduct = (i: { name: string; amount: number; commission: number; minimumStock?: number }) =>
  i.name.trim() !== '' &&
  Number.isFinite(i.amount) &&
  i.amount >= 0 &&
  Number.isFinite(i.commission) &&
  i.commission >= 0 &&
  (i.minimumStock === undefined || (Number.isInteger(i.minimumStock) && i.minimumStock >= 0));

const INVALID_PRODUCT: Result = { ok: false, error: 'Enter a name, an amount and commission of 0 or more, and a whole-number Minimum Stock of 0 or more.' };

/** Active items in Item Master order, by id. A position is 1-based and always contiguous. */
const orderedIds = () => getDatabase().products.filter((p) => p.active).map((p) => p.id);

/** Writes serial = position for every id in `ids` whose saved serial differs (everything else is left alone). */
function resequence(batch: WriteBatch, ids: string[], skip?: string) {
  const saved = new Map(getDatabase().products.map((p) => [p.id, p.serial]));
  ids.forEach((id, i) => {
    if (id !== skip && saved.get(id) !== i + 1) batchSetSerial(batch, id, i + 1);
  });
}

/** `ids` with `id` placed at the 1-based `position`, clamped to the list; no position means the end. */
function insertAt(ids: string[], id: string, position: number | undefined) {
  const at = position === undefined || !Number.isInteger(position) ? ids.length : Math.min(Math.max(position, 1), ids.length + 1) - 1;
  return [...ids.slice(0, at), id, ...ids.slice(at)];
}

/**
 * Adds a product. Its opening stock is stored in the product's `stock` field. `position` (1-based)
 * is where it goes in the Item Master order; the items from there on move down by one. No position
 * puts it last.
 */
/** Item Master changes (add, edit price / commission / name, reorder, delete) are the owner's alone, whatever screen asks. Frontend check only. */
const OWNER_ONLY: Result = { ok: false, error: 'Only the owner can change the Item Master.' };
const ownerOnly = () => getActiveProfile()?.role === 'owner';

export async function addProduct(input: { name: string; amount: number; commission: number; minimumStock: number; openingStock: number; position?: number }): Promise<Result> {
  if (!ownerOnly()) return OWNER_ONLY;
  if (!validProduct(input) || !Number.isInteger(input.openingStock) || input.openingStock < 0) return INVALID_PRODUCT;
  const name = input.name.trim();
  const id = productIdFor(name);
  if (!id) return INVALID_PRODUCT;
  const same = getDatabase().products.find((p) => p.id === id || p.name.toLowerCase() === name.toLowerCase());
  if (same?.active) return { ok: false, error: 'A product with this name already exists.' };
  const batch = newBatch();
  if (same) {
    // A deleted product added again comes back (its old records stay linked) with the new price and commission.
    const ids = insertAt(orderedIds(), same.id, input.position);
    batchUpdateProduct(batch, same.id, { name, amount: input.amount, commission: input.commission, minimumStock: input.minimumStock, active: true, serial: ids.indexOf(same.id) + 1 });
    resequence(batch, ids, same.id);
    return commit(batch, 'Unable to save product.');
  }
  const ids = insertAt(orderedIds(), id, input.position);
  batchCreateProduct(batch, id, { name, amount: input.amount, commission: input.commission, minimumStock: input.minimumStock, stock: input.openingStock, serial: ids.indexOf(id) + 1, initializedBy: actor() });
  resequence(batch, ids, id);
  return commit(batch, 'Unable to save product.');
}

/** Edits name / amount / commission / Minimum Stock. Stock is never changed here; it only moves through receipts and direct bills. */
export async function updateProduct(id: string, input: { name: string; amount: number; commission: number; minimumStock: number; active?: boolean }): Promise<Result> {
  if (!ownerOnly()) return OWNER_ONLY;
  if (!validProduct(input)) return INVALID_PRODUCT;
  if (!getDatabase().products.some((p) => p.id === id)) return { ok: false, error: 'This product no longer exists.' };
  const batch = newBatch();
  batchUpdateProduct(batch, id, { name: input.name.trim(), amount: input.amount, commission: input.commission, minimumStock: input.minimumStock, active: input.active });
  return commit(batch, 'Unable to save product.');
}

/** Units of each product that are with salesmen right now (not yet sold), for showing next to the warehouse stock. Read-only. */
export function useOutstandingByProduct(): StockMap {
  const db = useDatabase();
  return useMemo(() => outstandingByProduct(db), [db]);
}

/** A fresh id for one save of a count. Keep it while retrying the same count: it is what makes a retry harmless. */
export const newOpeningSubmissionId = () => newId('os');

/**
 * Opening Stock (Item Master), the initial inventory exercise: the quantity the owner enters and saves IS the product's main warehouse
 * stock. It REPLACES `products.stock` (a count of 100 on a balance of 50 gives 100, not 150) and is never reduced by salesman allocations or
 * adjusted by history. Receipts, bills, returns and allocations are neither blocked by it nor rewritten by it. The owner can save a product
 * again to correct it, one product or many, over as many days as it takes. Each product is its own awaited transaction (one refusal never
 * blocks the others, and a product is reported saved only after it committed).
 */
export async function initializeOpeningStock(items: { id: string; counted: number; submissionId: string }[]): Promise<Record<string, Result>> {
  if (!ownerOnly()) return Object.fromEntries(items.map((i) => [i.id, OWNER_ONLY]));
  const known = new Map(getDatabase().products.filter((p) => p.active).map((p) => [p.id, p]));
  const out: Record<string, Result> = {};
  const todo: typeof items = [];
  for (const item of items) {
    if (!known.has(item.id)) out[item.id] = { ok: false, error: 'This product no longer exists.' };
    else if (!Number.isSafeInteger(item.counted) || item.counted < 0) out[item.id] = { ok: false, error: 'Enter a whole number of 0 or more.' };
    else todo.push(item);
  }
  const done = await runInitialization(
    todo,
    (item) => initializeOpeningStockTransaction(item.id, { counted: item.counted, submissionId: item.submissionId }, actor()),
    (e) => (e instanceof OpeningStockRefused ? e.message : friendlyError(e, 'Unable to save the opening stock.')),
  );
  return { ...out, ...done };
}

/** Moves an item to `position` (1-based) in the Item Master order; the items in between shift by one. */
export async function moveProduct(id: string, position: number): Promise<Result> {
  if (!ownerOnly()) return OWNER_ONLY;
  if (!Number.isInteger(position) || position < 1) return { ok: false, error: 'Enter a serial number of 1 or more.' };
  if (!getDatabase().products.some((p) => p.id === id && p.active)) return { ok: false, error: 'This product no longer exists.' };
  const rest = orderedIds().filter((x) => x !== id);
  const batch = newBatch();
  resequence(batch, insertAt(rest, id, position));
  return commit(batch, 'Unable to change the order.');
}

/**
 * Deletes a product from the owner's point of view: it disappears from every list. The document is
 * kept, marked inactive, because earlier bills and stock entries refer to it.
 */
export async function deleteProduct(id: string): Promise<Result> {
  if (!ownerOnly()) return OWNER_ONLY;
  const p = getDatabase().products.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'This product no longer exists.' };
  const batch = newBatch();
  batchUpdateProduct(batch, id, { name: p.name, amount: p.amount, commission: p.commission, active: false });
  resequence(batch, orderedIds().filter((x) => x !== id)); // close the gap
  return commit(batch, 'Unable to delete the product.');
}

// ─── Employees (owner only) ────────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates an Employee: a Firebase Auth login (the login ID is an email address, as Firebase Auth requires) made through a
 * separate auth instance so the owner stays signed in, plus the users/{uid} profile with the role and the three permissions.
 * The password goes to Firebase Auth only: it is never stored in Firestore or shown again.
 */
export async function createEmployee(input: { name: string; email: string; password: string; permissions: Permissions }): Promise<Result> {
  if (!ownerOnly()) return { ok: false, error: 'Only the owner can manage employees.' };
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: 'Enter the employee name.' };
  if (!EMAIL.test(email)) return { ok: false, error: 'Enter the login ID as an email address, for example ramesh@murlidhar.com.' };
  if (input.password.length < 8) return { ok: false, error: 'The password must be at least 8 characters.' };
  if (getDatabase().users.some((u) => u.email.trim().toLowerCase() === email)) return { ok: false, error: 'This login ID is already in use.' };
  let uid: string;
  try {
    uid = await createLogin(email, input.password);
  } catch (e) {
    return { ok: false, error: isEmailInUse(e) ? 'This login ID is already in use.' : friendlyError(e, 'Unable to create the login.') };
  }
  try {
    await settle(writeEmployeeProfile(uid, { name, email, permissions: input.permissions }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `The login ${email} was created, but its profile could not be saved (${friendlyError(e, 'unknown error')}). It cannot sign in until the profile exists.` };
  }
}

/** Changes an Employee's name, permissions or active flag. Only Employees: the owner's account can never be changed here. */
export async function updateEmployee(uid: string, input: { name: string; permissions: Permissions; active: boolean }): Promise<Result> {
  if (!ownerOnly()) return { ok: false, error: 'Only the owner can manage employees.' };
  const target = getDatabase().users.find((u) => u.id === uid);
  if (!target || target.role !== 'employee') return { ok: false, error: 'Only employee accounts can be changed here.' };
  if (!input.name.trim()) return { ok: false, error: 'Enter the employee name.' };
  try {
    await settle(updateEmployeeProfile(uid, { name: input.name.trim(), permissions: input.permissions, active: input.active }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to save the employee.') };
  }
}

/** Sends the employee a password-reset email (they choose the new password; the owner never sees it). */
export async function resetEmployeePassword(uid: string): Promise<Result> {
  if (!ownerOnly()) return { ok: false, error: 'Only the owner can manage employees.' };
  const target = getDatabase().users.find((u) => u.id === uid);
  if (!target || target.role !== 'employee') return { ok: false, error: 'Only employee accounts can be changed here.' };
  try {
    await sendReset(target.email);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to send the reset email.') };
  }
}

// ─── Salesman Master ───────────────────────────────────────────────────────────────────────────

export async function saveSalesman(input: { id?: string; name: string; phone: string }): Promise<Result> {
  if (!input.name.trim()) return { ok: false, error: 'Enter the salesman name.' };
  if (input.id && !getDatabase().salesmen.some((s) => s.id === input.id)) return { ok: false, error: 'This salesman no longer exists.' };
  try {
    await settle(writeSalesman({ id: input.id ?? newId('sm'), name: input.name.trim(), phone: input.phone.trim(), isNew: !input.id }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to save salesman.') };
  }
}

/**
 * Deletes a salesman from the owner's point of view: they disappear from every list. The record is
 * kept (marked inactive) because final bills refer to it, and their sign-in account is not touched.
 */
export async function deleteSalesman(id: string): Promise<Result> {
  if (!getDatabase().salesmen.some((s) => s.id === id)) return { ok: false, error: 'This salesman no longer exists.' };
  try {
    await settle(archiveSalesman(id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to delete the salesman.') };
  }
}

// ─── Stock receive ─────────────────────────────────────────────────────────────────────────────

export function useReceiptPaymentEntries(): ReceiptPaymentEntry[] {
  return useDatabase().receiptPaymentEntries;
}

export type ReceiptPaymentRow = { id: string; amount: number; at: string; paidAfter: number; remainingAfter: number };

/** Payments made against one receipt, newest first, each with the cumulative paid and the balance left after it. */
export function receiptPaymentHistory(receipt: Receipt, entries: ReceiptPaymentEntry[]): ReceiptPaymentRow[] {
  if (receipt.totalAmount === null) return [];
  const total = receipt.totalAmount;
  let paid = 0;
  return entries
    .filter((e) => e.receiptId === receipt.id)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .map((e) => {
      paid = cents(paid + e.amount);
      return { id: e.id, amount: e.amount, at: e.at, paidAfter: paid, remainingAfter: cents(total - paid) };
    })
    .reverse();
}

/** A fresh id for one supplier payment being entered. Keep it while retrying the same payment. */
export const newReceiptPaymentSubmissionId = () => newId('rp');

/** Records an additional payment to the supplier against one receipt (atomic with the receipt's summary; never touches stock). */
export async function recordReceiptPayment(receiptId: string, amount: number, submissionId: string): Promise<Result> {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Enter a payment above 0.' };
  try {
    await recordReceiptPaymentTransaction(receiptId, cents(amount), submissionId, new Date().toISOString(), actor());
    return { ok: true };
  } catch (e) {
    if (e instanceof ReceiptPaymentRefused) return { ok: false, error: e.message };
    return { ok: false, error: friendlyError(e, 'Unable to record the payment.') };
  }
}

/** Party → warehouse. Every receipt keeps the party's name and number for the Stock Receive statement. `payment` is what the receipt cost and how much of it was paid now. */
export async function receiveStock(party: { name: string; phone: string }, items: Item[], payment: { total: number; paid: number }, submissionId?: string): Promise<Result> {
  const partyName = party.name.trim();
  if (!partyName) return { ok: false, error: 'Enter the party name.' };
  const mobile = validMobile(party.phone);
  if (!mobile) return { ok: false, error: MOBILE_ERROR };
  if (items.length === 0 || items.some((i) => !whole(i.qty))) return BAD_ITEMS;
  if (!Number.isFinite(payment.total) || payment.total <= 0) return { ok: false, error: 'Enter the Total Purchase Amount.' };
  if (!Number.isFinite(payment.paid) || payment.paid < 0) return { ok: false, error: 'Paid Amount cannot be negative.' };
  if (cents(payment.paid) > cents(payment.total)) return { ok: false, error: 'Paid Amount cannot be more than the Total Purchase Amount.' };
  const db = getDatabase();
  const known = new Set(db.products.map((p) => p.id));
  if (items.some((i) => !known.has(i.id))) return { ok: false, error: 'A product in this list no longer exists.' };
  // One receipt per product line: merge repeated products. The receipt id is the submission id, and every ledger line id follows from it
  // (receipt + product), so an ambiguous retry of the same submission rewrites the same documents and, with the transaction's
  // "payment record already exists" check, never adds the stock a second time.
  const merged = [...items.reduce((m, i) => m.set(i.id, (m.get(i.id) ?? 0) + i.qty), new Map<string, number>())].map(([id, qty]) => ({ id, qty }));
  const at = new Date().toISOString();
  const receiptId = submissionId ?? newId('rc');
  const txs: ReceiveStockTx[] = merged.map((i) => ({
    id: `${receiptId}_${i.id}`,
    type: 'RECEIVE_STOCK',
    at,
    date: businessDate(at),
    businessDate: businessDate(at),
    productId: i.id,
    qty: i.qty,
    userId: actor(),
    stockApplied: true,
    receiptId,
    partyId: mobile,
    partyName,
    partyPhone: mobile,
  }));
  // The party is the mobile number: a known number reuses its party record (whatever name was typed), a new one creates it.
  const stock: Record<string, number> = {};
  for (const i of merged) stock[i.id] = i.qty;
  try {
    // Awaited as it is, with no timeout: success is reported only once Firestore has committed the transaction.
    await recordReceipt({ id: mobile, name: partyName }, txs, stock, { receiptId, totalAmount: cents(payment.total), paidAmount: cents(payment.paid), at });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to record the received stock.') };
  }
}

const MOBILE_ERROR = 'Enter a 10-digit mobile number (digits only).';

/** A party's mobile number: exactly 10 digits, nothing else (no spaces, letters or country code). null if it is not. */
export const validMobile = (raw: string): string | null => (/^\d{10}$/.test(raw) ? raw : null);

/** Corrects the displayed name of a party. Its mobile number (its identity) never changes, and past receipts keep their ids. */
export async function renameParty(partyId: string, name: string): Promise<Result> {
  const next = name.trim();
  if (!next) return { ok: false, error: 'Enter the party name.' };
  if (!getDatabase().parties.some((p) => p.id === partyId)) return { ok: false, error: 'This party no longer exists.' };
  try {
    await settle(writePartyName(partyId, next));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to save the name.') };
  }
}

/** The Salesman Statement from the SAVED finalized daily bills (salesmen/{id}/dailyBills/{date}) of one salesman in a date range; never from the working bill. */
export async function loadStatement(salesmanId: string, from: string, to: string): Promise<Statement> {
  return buildStatement(await getFinalizedBills(salesmanId, from, to), getDatabase().products, from, to);
}

/** Marks ONE receipt Paid or Unpaid. Only that receipt's payment document changes: no stock, no receipt lines, no other receipt. */
export async function setReceiptPaid(receiptId: string, paid: boolean): Promise<Result> {
  try {
    await settle(writeReceiptPaid(receiptId, paid));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to save the payment status.') };
  }
}

/** Parties by mobile number. */
export function useParties() {
  return useDatabase().parties;
}

// ─── Direct (private) bill ─────────────────────────────────────────────────────────────────────

const cents = (n: number) => Math.round(n * 100) / 100;

/** Payment picture for a total and an amount paid so far: remaining and status. Zero total counts as unpaid with nothing remaining. */
export function paymentOf(total: number, paid: number): { paid: number; remaining: number; status: PaymentStatus } {
  const t = cents(total);
  const p = cents(paid);
  const remaining = cents(Math.max(0, t - p));
  return { paid: p, remaining, status: t > 0 && remaining === 0 ? 'paid' : p > 0 ? 'partial' : 'unpaid' };
}

/** Payment of a saved bill; bills saved before payments existed read as Unpaid with the full amount remaining. */
export function billPayment(b: DirectBill) {
  return b.paymentStatus && typeof b.paidAmount === 'number' ? { paid: b.paidAmount, remaining: b.remainingAmount ?? cents(b.total - b.paidAmount), status: b.paymentStatus } : paymentOf(b.total, 0);
}

export function useDirectBillPayments(): DirectBillPayment[] {
  return useDatabase().directBillPayments;
}

export type PaymentHistoryRow = { id: string; amount: number; at: string; paidAfter: number; remainingAfter: number; opening: boolean };

/**
 * A bill's payments, newest first, each with the cumulative paid and the balance left after it. The bill's stored paidAmount is the
 * truth: anything in it that no payment record accounts for (a bill saved before payment records existed) is shown once as the
 * opening payment at the bill's own time, so legacy bills show correctly and nothing is counted twice.
 */
export function paymentHistory(bill: DirectBill, payments: DirectBillPayment[]): PaymentHistoryRow[] {
  const mine = payments.filter((p) => p.billId === bill.id).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const legacy = cents((bill.paidAmount ?? 0) - mine.reduce((s, p) => s + p.amount, 0));
  const entries = [...(legacy > 0 ? [{ id: `${bill.id}_legacy`, amount: legacy, at: bill.at, opening: true }] : []), ...mine.map((p) => ({ id: p.id, amount: p.amount, at: p.at, opening: p.id === `${bill.id}_p0` }))];
  let paid = 0;
  return entries
    .map((e) => {
      paid = cents(paid + e.amount);
      return { ...e, paidAfter: paid, remainingAfter: cents(bill.total - paid) };
    })
    .reverse();
}

/** A fresh id for one payment being entered. Keep it while retrying the same payment; make a new one for the next payment. */
export const newPaymentSubmissionId = () => newId('dp');

/** Records an additional payment against a saved bill (atomic with the bill's summary; never touches stock). */
export async function recordDirectBillPayment(billId: string, amount: number, submissionId: string): Promise<Result> {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Enter a payment above 0.' };
  const bill = getDatabase().directBills.find((b) => b.id === billId);
  if (!bill) return { ok: false, error: 'This bill no longer exists.' };
  try {
    await recordDirectBillPaymentTransaction(billId, cents(amount), submissionId, new Date().toISOString(), actor());
    return { ok: true };
  } catch (e) {
    if (e instanceof PaymentRefused) return { ok: false, error: e.message };
    return { ok: false, error: friendlyError(e, 'Unable to record the payment.') };
  }
}

export type DirectBillInput = {
  customerName: string;
  customerPhone: string;
  lines: { productId: string; qty: number; rate: number }[];
  /** Amount paid now (default 0). Saved with the bill in the same transaction. */
  paidAmount?: number;
  /** Identifies ONE submission of this bill (see newBillSubmissionId): the same id again can never save a second bill or deduct stock twice. */
  submissionId?: string;
};

/** A fresh submission id for a bill being entered. Keep it while retrying the same bill; make a new one for the next bill. */
export const newBillSubmissionId = () => newId('db');

/**
 * Saves a direct bill and takes its quantities off the warehouse stock in one Firestore transaction (see
 * saveDirectBillTransaction). Rates are typed by the owner; the Item Master amount is never used. Refused
 * (nothing written) if any quantity is more than the warehouse holds at that moment.
 */
export async function saveDirectBill(input: DirectBillInput): Promise<Result> {
  // Customer name and mobile are optional: left empty they are saved as empty strings (nothing is invented).
  const customerName = input.customerName.trim();
  const customerPhone = input.customerPhone.trim();
  if (input.lines.length === 0) return { ok: false, error: 'Add at least one item.' };
  if (input.lines.some((l) => !l.productId || !whole(l.qty))) return { ok: false, error: 'Choose a product and enter a whole quantity above 0 for every row.' };
  if (input.lines.some((l) => !Number.isFinite(l.rate) || l.rate < 0)) return { ok: false, error: 'Enter a rate for every row.' };
  const db = getDatabase();
  const product = new Map(db.products.filter((p) => p.active).map((p) => [p.id, p]));
  if (input.lines.some((l) => !product.has(l.productId))) return { ok: false, error: 'A product in this bill is no longer available.' };

  const wanted: Record<string, number> = {};
  for (const l of input.lines) wanted[l.productId] = (wanted[l.productId] ?? 0) + l.qty;
  // Stock is NOT judged from this screen's copy of the data: the transaction below reads each product's current stock and refuses the bill.
  const at = new Date().toISOString();
  const lines: DirectBillLine[] = input.lines.map((l) => ({
    productId: l.productId,
    name: product.get(l.productId)?.name ?? l.productId,
    qty: l.qty,
    rate: l.rate,
    total: Math.round(l.qty * l.rate * 100) / 100,
  }));
  const total = Math.round(lines.reduce((n, l) => n + l.total, 0) * 100) / 100;
  const paidIn = input.paidAmount ?? 0;
  if (!Number.isFinite(paidIn) || paidIn < 0) return { ok: false, error: 'Paid Amount cannot be negative.' };
  if (cents(paidIn) > total) return { ok: false, error: 'Paid Amount cannot be more than the Total Amount.' };
  const pay = paymentOf(total, paidIn);
  const bill: DirectBill = {
    id: input.submissionId ?? newId('db'),
    customerName,
    customerPhone,
    at,
    date: localDate(at),
    lines,
    total,
    paidAmount: pay.paid,
    remainingAmount: pay.remaining,
    paymentStatus: pay.status,
    userId: actor(),
  };
  try {
    await saveDirectBillTransaction(bill, wanted, outstandingByProduct(db));
    return { ok: true };
  } catch (e) {
    if (e instanceof NotEnoughStockForBill) return overLimit(e.message);
    return { ok: false, error: friendlyError(e, 'Unable to save the bill.') };
  }
}

export type DirectBillEditInput = {
  customerName: string;
  customerPhone: string;
  /** The whole edited bill's lines (a product once, rate typed). */
  lines: { productId: string; qty: number; rate: number }[];
  /** Identifies ONE submission of this edit (see newBillSubmissionId): a repeated Save of the same edit changes nothing twice. */
  submissionId: string;
};

/**
 * Edits a saved private bill: customer, lines, quantities and rates. The bill's stock is reversed and re-applied as one net change per
 * product, inside one Firestore transaction with the bill update (see editDirectBillTransaction). Payments are kept as they are; the
 * total may not fall below what is already paid. Nothing is written if anything is refused.
 */
export async function editDirectBill(billId: string, input: DirectBillEditInput): Promise<Result> {
  const customerName = input.customerName.trim();
  const customerPhone = input.customerPhone.trim();
  if (input.lines.length === 0) return { ok: false, error: 'Add at least one item.' };
  if (input.lines.some((l) => !l.productId || !whole(l.qty))) return { ok: false, error: 'Choose a product and enter a whole quantity above 0 for every row.' };
  if (input.lines.some((l) => !Number.isFinite(l.rate) || l.rate < 0)) return { ok: false, error: 'Enter a rate for every row.' };
  const db = getDatabase();
  const old = db.directBills.find((b) => b.id === billId);
  if (!old) return { ok: false, error: 'This bill no longer exists.' };
  const name = new Map(db.products.map((p) => [p.id, p.name]));
  // A line already on the bill keeps its saved name; a new one takes the Item Master name.
  const lines: DirectBillLine[] = input.lines.map((l) => ({
    productId: l.productId,
    name: old.lines.find((x) => x.productId === l.productId)?.name ?? name.get(l.productId) ?? l.productId,
    qty: l.qty,
    rate: l.rate,
    total: Math.round(l.qty * l.rate * 100) / 100,
  }));
  const total = Math.round(lines.reduce((n, l) => n + l.total, 0) * 100) / 100;
  try {
    await editDirectBillTransaction(billId, { customerName, customerPhone, lines, total, editId: input.submissionId, at: new Date().toISOString(), userId: actor() }, outstandingByProduct(db));
    return { ok: true };
  } catch (e) {
    if (e instanceof EditRefused) return overLimit(e.message);
    return { ok: false, error: friendlyError(e, 'Unable to save the changes.') };
  }
}

// ─── Expenses (owner only) ─────────────────────────────────────────────────────────────────────

export type { Expense } from './db/schema';
export function useExpenses(): Expense[] {
  return useDatabase().expenses;
}

export type ExpenseInput = { title: string; amount: number; date: string; notes: string };
const realDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
function checkExpense(i: ExpenseInput): string | null {
  if (!i.title.trim()) return 'Enter a title for the expense.';
  if (!Number.isFinite(i.amount) || i.amount <= 0) return 'Enter an amount above 0.';
  if (!realDay(i.date)) return 'Choose a valid date.';
  return null;
}

/** A fresh id for one expense being entered. Keep it while retrying the same expense; make a new one for the next. */
export const newExpenseSubmissionId = () => newId('ex');

/** Records an expense (owner only, enforced again by the Firestore rules). Idempotent per submission id. Touches no stock, purchase or bill. */
export async function saveExpense(input: ExpenseInput, submissionId: string): Promise<Result> {
  const bad = checkExpense(input);
  if (bad) return { ok: false, error: bad };
  try {
    await createExpenseTransaction({ id: submissionId, title: input.title.trim(), amount: cents(input.amount), date: input.date, notes: input.notes.trim(), createdAt: new Date().toISOString(), userId: actor() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to save the expense.') };
  }
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<Result> {
  const bad = checkExpense(input);
  if (bad) return { ok: false, error: bad };
  try {
    await updateExpenseDoc(id, { title: input.title.trim(), amount: cents(input.amount), date: input.date, notes: input.notes.trim() }, new Date().toISOString(), actor());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to save the changes.') };
  }
}

export async function deleteExpense(id: string): Promise<Result> {
  try {
    await deleteExpenseDoc(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, 'Unable to delete the expense.') };
  }
}

// ─── Private Bill customers and their last rates ───────────────────────────────────────────────
// There is no customer collection: a customer is whatever the saved bills say. The bills are already loaded for the Statement, so the
// last rate of a product for a customer is DERIVED from their saved lines (newest bill first) and nothing separate is stored or cached;
// a bill that failed to save is not in directBills, so it can never become anyone's last rate.

const phoneKey = (v: string) => v.replace(/\D/g, '').slice(-10);
const nameKey = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Whether a saved bill belongs to the customer typed as (name, phone), without ever merging different people:
 *  - a full mobile number (10 digits) matches bills with the same normalized number, whatever name was typed;
 *  - no mobile typed: matches only bills that also have no mobile and the same (case-insensitive) name;
 *  - a part-typed mobile, or nothing typed, matches nobody.
 */
function sameCustomer(b: DirectBill, name: string, phone: string) {
  const pk = phoneKey(phone);
  if (pk.length >= 10) return phoneKey(b.customerPhone ?? '') === pk;
  if (pk.length > 0) return false;
  const nk = nameKey(name);
  return nk !== '' && phoneKey(b.customerPhone ?? '') === '' && nameKey(b.customerName ?? '') === nk;
}

/** The rate this customer was last billed per product: from their newest saved bill that has a line for it. Products never bought are absent. */
export function customerLastRates(bills: DirectBill[], name: string, phone: string): Record<string, number> {
  const out: Record<string, number> = {};
  const mine = bills.filter((b) => sameCustomer(b, name, phone)).sort((a, b) => b.at.localeCompare(a.at));
  for (const b of mine) for (const l of b.lines) if (!(l.productId in out) && Number.isFinite(l.rate) && l.rate >= 0) out[l.productId] = l.rate;
  return out;
}

export type CustomerSuggestion = { name: string; phone: string };

/** Distinct customers from the saved bills (newest first) whose name or mobile contains what was typed. */
export function customerSuggestions(bills: DirectBill[], name: string, phone: string, limit = 5): CustomerSuggestion[] {
  const nq = nameKey(name);
  const pq = phone.replace(/\D/g, '');
  if (!nq && !pq) return [];
  const seen = new Map<string, CustomerSuggestion>();
  for (const b of [...bills].sort((x, y) => y.at.localeCompare(x.at))) {
    const n = (b.customerName ?? '').trim();
    const p = (b.customerPhone ?? '').trim();
    if (!n && !p) continue;
    if ((nq && !nameKey(n).includes(nq)) || (pq && !phoneKey(p).includes(pq) && !p.replace(/\D/g, '').includes(pq))) continue;
    const key = phoneKey(p) ? `p:${phoneKey(p)}` : `n:${nameKey(n)}`;
    if (!seen.has(key)) seen.set(key, { name: n, phone: p });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

// ─── Salesman bill ─────────────────────────────────────────────────────────────────────────────

/** Builds a bill document. `returns` is null until the bill is finalized (`draft` keeps Returns typed so far). Nothing here moves warehouse stock. */
function buildBill(salesmanId: string, date: string, rows: OpenBillRow[], addMore: Record<string, number>, returns: Record<string, number> | null, draft: Record<string, number> = {}): Settlement {
  const db = getDatabase();
  const master = new Map(db.products.map((p) => [p.id, p]));
  const old = db.settlements.find((s) => s.id === settlementId(salesmanId, date));
  const now = new Date().toISOString();
  // An item with nothing on it (no Fillup, no Add More) is not part of the bill.
  const ids = [...new Set([...rows.map((r) => r.productId), ...Object.keys(addMore)])].filter(
    (id) => (rows.find((r) => r.productId === id)?.fillup ?? 0) + (addMore[id] ?? 0) > 0,
  );
  const lines: SettlementLine[] = ids.map((productId) => {
    const fillup = rows.find((r) => r.productId === productId)?.fillup ?? 0;
    const add = addMore[productId] ?? 0;
    const total = fillup + add;
    const ret = returns ? returns[productId] : (draft[productId] ?? 0);
    const m = master.get(productId);
    return {
      productId,
      carriedOpeningQuantity: fillup,
      newFillupQuantity: add,
      totalAvailableQuantity: total,
      returnQuantity: ret,
      ...(returns ? {} : { returnEntered: productId in draft }),
      soldQuantity: returns ? total - ret : 0,
      unitAmount: m?.amount ?? 0,
      unitCommission: m?.commission ?? 0,
    };
  });
  return withSummary({
    id: settlementId(salesmanId, date),
    salesmanId,
    statementDay: date,
    finalized: returns !== null,
    finalizedAt: returns ? now : '',
    finalizedBy: returns ? actor() : '',
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    lines,
  });
}

/** Adds the date-wise fields: businessDate, status, and (once finalized) the bill's totals. A working bill carries no totals. */
function withSummary(s: Settlement): Settlement {
  const { totals: _old, ...rest } = s;
  const out: Settlement = { ...rest, businessDate: s.statementDay, status: s.finalized ? 'finalized' : 'open' };
  if (s.finalized) {
    const t = billTotals(s.lines);
    out.totals = { fillup: s.lines.reduce((x, l) => x + l.totalAvailableQuantity, 0), returned: s.lines.reduce((x, l) => x + l.returnQuantity, 0), sold: t.sold, amount: t.amount, commission: t.commission };
  }
  return out;
}

/** Writes a bill with its warehouse-stock check, and the Sold deduction when it is finalized (one transaction; see setSettlementWithStock). */
async function writeBill(bill: Settlement): Promise<Result> {
  try {
    await setSettlementWithStock(bill, outstandingByProduct(getDatabase()));
    return { ok: true };
  } catch (e) {
    if (e instanceof NotEnoughStock) return overLimit(e.message);
    return { ok: false, error: friendlyError(e, 'Unable to save the bill.') };
  }
}

/** A fresh id for one receipt being entered (see receiveStock): keep it while retrying the same receipt, make a new one for the next. */
export const newReceiptSubmissionId = () => newId('rc');

/** A unique id for one Save Stock Given operation. */
export const newOperationId = () => newId('sg');

/**
 * Save Stock Given: adds the quantities to today's bill as stock given, exactly once per `operationId` (see giveStockTransaction).
 * Fillup then reads carried Return + stock given so far; the warehouse stock is checked but never changed.
 */
export async function giveStock(salesmanId: string, items: Record<string, number>, operationId: string, day?: string): Promise<Result> {
  const db = getDatabase();
  if (!db.salesmen.some((s) => s.id === salesmanId)) return { ok: false, error: 'This salesman no longer exists.' };
  const ids = Object.keys(items).filter((id) => items[id] > 0);
  if (ids.length === 0 || ids.some((id) => !Number.isInteger(items[id]))) return { ok: false, error: 'Enter a whole quantity above 0.' };
  const bad = checkAddMore(items);
  if (!bad.ok) return bad;
  const { current } = salesmanBills(db, salesmanId, todayISO(), day);
  const given = Object.fromEntries(ids.map((id) => [id, items[id]]));
  // The screen's picture of the bill: supplies each product's carried Fillup; the server adds to what it really holds.
  const known = Object.fromEntries(current.rows.map((r) => [r.productId, r.addMore]));
  const bill = buildBill(salesmanId, current.date, current.rows, { ...known, ...Object.fromEntries(ids.map((id) => [id, (known[id] ?? 0) + given[id]])) }, null);
  try {
    await giveStockTransaction(bill, { id: operationId, at: new Date().toISOString(), salesmanName: db.salesmen.find((m) => m.id === salesmanId)?.name ?? '', items: given }, outstandingByProduct(db));
    return { ok: true };
  } catch (e) {
    if (e instanceof NotEnoughStock) return { ok: false, error: e.message, limit: true, shortages: e.shortages };
    return { ok: false, error: friendlyError(e, 'Unable to save the stock given.') };
  }
}

/** The salesman's stock-given activity between two business dates, newest first (salesmen/{id}/activities). */
export async function loadActivities(salesmanId: string, from: string, to: string): Promise<Activity[]> {
  return getActivities(salesmanId, from, to);
}
export type { Activity } from './firebase/repositories/settlements';

/** Checks the Add More figures typed on the open bill (whole numbers from 0, products from the Item Master). */
function checkAddMore(addMore: Record<string, number>): Result {
  const known = new Set(getDatabase().products.filter((p) => p.active).map((p) => p.id));
  for (const [id, n] of Object.entries(addMore)) {
    if (!known.has(id)) return { ok: false, error: 'A product on this bill no longer exists.' };
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'Add More must be a whole number, 0 or more.' };
  }
  return { ok: true };
}

/**
 * Saves today's bill: which items are on it and how much was added to each (Add More). Fillup is not
 * typed; it always follows the previous bill's Return. Today's bill has no Return: the goods come
 * back tomorrow. It can be saved again and again during the day.
 */
export async function saveOpenBill(salesmanId: string, addMore: Record<string, number>, returns?: Record<string, number>, day?: string): Promise<Result> {
  const db = getDatabase();
  if (!db.salesmen.some((s) => s.id === salesmanId)) return { ok: false, error: 'This salesman no longer exists.' };
  const bad = checkAddMore(addMore);
  if (!bad.ok) return bad;
  const { current } = salesmanBills(db, salesmanId, todayISO(), day);
  // Returns typed so far on this bill are kept (the bill's own Return is entered on its own day).
  const draft = returns ?? Object.fromEntries(current.rows.filter((r) => r.returned !== undefined).map((r) => [r.productId, r.returned as number]));
  return writeBill(buildBill(salesmanId, current.date, current.rows, addMore, null, draft));
}

/**
 * Finalizes the bill of its own day once the salesman is back: the Return of every item on it is entered
 * (0 up to the Total), then Sold = Total − Return, Amount and Commission. That Return is the next bill's
 * Fillup. A bill dated after today cannot be finalized, and an earlier bill still waiting must be finalized first.
 * Refused, changing nothing, if a Return is missing or more than the Total.
 */
export async function finalizeCurrentBill(salesmanId: string, addMore: Record<string, number>, returns: Record<string, number>, day?: string): Promise<Result> {
  const db = getDatabase();
  if (!db.salesmen.some((s) => s.id === salesmanId)) return { ok: false, error: 'This salesman no longer exists.' };
  const bad = checkAddMore(addMore);
  if (!bad.ok) return bad;
  const { current, pending } = salesmanBills(db, salesmanId, todayISO(), day);
  if (pending) return { ok: false, error: 'Finalize the earlier bill first.' };
  // A Return may be confirmed on any date the books allow (see salesmanBills), past or future.
  if (day !== undefined && current.date !== day) return { ok: false, error: 'A bill cannot be confirmed for this date. Confirm the earlier bills in order.' };
  const fill = new Map(current.rows.map((r) => [r.productId, r.fillup]));
  const ids = new Set([...fill.keys(), ...Object.keys(addMore)]);
  let any = false;
  for (const id of ids) {
    const total = (fill.get(id) ?? 0) + (addMore[id] ?? 0);
    if (total <= 0) continue;
    any = true;
    const n = returns[id];
    if (n === undefined || !Number.isInteger(n) || n < 0) return { ok: false, error: 'Enter the Return for every item.' };
    if (n > total) return overLimit('A Return is more than the Total. Please adjust it.');
  }
  if (!any) return { ok: false, error: 'There is nothing on this bill.' };
  return writeBill(buildBill(salesmanId, current.date, current.rows, addMore, returns));
}

/** The Add More figures already on a bill, as the map buildBill expects. */
const addMoreOf = (rows: OpenBillRow[]) => Object.fromEntries(rows.map((r) => [r.productId, r.addMore]));

/**
 * Corrects TODAY's finalized bill in place: Add More and Return per item, then Sold = Total − Return, with Amount
 * and Commission from the Item Master values now. Fillup (the opening carried in) can be corrected too. Older bills are never
 * corrected here. Each existing line keeps the unit amount and commission it was billed at (see correction-pricing.ts); only quantities change. The stock moves by the difference between the old and the corrected Sold, atomically, so saving
 * twice never deducts twice. The next day's Fillup follows the corrected Return; once a LATER bill is finalized
 * it has already been built on this Return, so the correction is refused instead of silently corrupting it.
 */
export async function correctTodayBill(salesmanId: string, addMore: Record<string, number>, returns: Record<string, number>, fillups: Record<string, number> = {}, day: string = todayISO()): Promise<Result> {
  const db = getDatabase();
  const today = day;
  const old = db.settlements.find((s) => s.id === settlementId(salesmanId, today));
  if (!old || !old.finalized) return { ok: false, error: 'There is no finalized bill for today to correct.' };
  if (db.settlements.some((s) => s.salesmanId === salesmanId && s.finalized && s.statementDay > today)) return { ok: false, error: 'A later bill is already finalized, so this one can no longer be corrected.' };
  if (db.settlements.some((s) => s.salesmanId === salesmanId && !s.finalized && s.statementDay > today && s.lines.some((l) => l.newFillupQuantity > 0))) return { ok: false, error: 'Stock has already been given on a later bill, so this one can no longer be corrected.' };
  const master = new Map(db.products.map((p) => [p.id, p]));
  const lines: SettlementLine[] = [];
  for (const l of old.lines) {
    const add = addMore[l.productId] ?? l.newFillupQuantity;
    const ret = returns[l.productId] ?? l.returnQuantity;
    if (!Number.isInteger(add) || add < 0 || !Number.isInteger(ret) || ret < 0) return { ok: false, error: 'Quantities must be whole numbers, 0 or more.' };
    const fill = fillups[l.productId] ?? l.carriedOpeningQuantity;
    if (!Number.isInteger(fill) || fill < 0) return { ok: false, error: 'Quantities must be whole numbers, 0 or more.' };
    const total = fill + add;
    if (ret > total) return overLimit('A Return is more than the Total. Please adjust it.');
    const m = master.get(l.productId);
    lines.push({ ...l, carriedOpeningQuantity: fill, newFillupQuantity: add, totalAvailableQuantity: total, returnQuantity: ret, soldQuantity: total - ret, ...correctionUnitValues(l, m) });
  }
  // Products that were not on the bill (nothing held that day) can be corrected onto it too: they start at 0 and only join the bill when the
  // correction gives them goods (Fillup + Add More above 0). The same transaction then checks that stock against what is still free.
  const onBillIds = new Set(old.lines.map((l) => l.productId));
  for (const m of db.products.filter((p) => p.active && !onBillIds.has(p.id))) {
    const fill = fillups[m.id] ?? 0;
    const add = addMore[m.id] ?? 0;
    const ret = returns[m.id] ?? 0;
    if ([fill, add, ret].some((q) => !Number.isInteger(q) || q < 0)) return { ok: false, error: 'Quantities must be whole numbers, 0 or more.' };
    const total = fill + add;
    if (ret > total) return overLimit('A Return is more than the Total. Please adjust it.');
    if (total <= 0) continue;
    lines.push({ productId: m.id, carriedOpeningQuantity: fill, newFillupQuantity: add, totalAvailableQuantity: total, returnQuantity: ret, soldQuantity: total - ret, unitAmount: m.amount, unitCommission: m.commission });
  }
  try {
    await correctFinalizedSettlement(withSummary({ ...old, updatedAt: new Date().toISOString(), lines }), today, outstandingByProduct(db));
    return { ok: true };
  } catch (e) {
    if (e instanceof NotEnoughStock) return { ok: false, error: e.message, limit: true, shortages: e.shortages };
    return { ok: false, error: friendlyError(e, 'Unable to save the changes.') };
  }
}

/** Keeps the Returns typed so far on the bill waiting for its Return, so a reload does not lose them. Nothing is calculated or finalized. */
export async function savePendingReturns(salesmanId: string, draft: Record<string, number>, day?: string): Promise<Result> {
  const { pending } = salesmanBills(getDatabase(), salesmanId, todayISO(), day);
  if (!pending) return { ok: false, error: 'No bill is waiting for a Return.' };
  return writeBill(buildBill(salesmanId, pending.date, pending.rows, addMoreOf(pending.rows), null, draft));
}

/**
 * Finalizes the bill that is waiting for its Return, once the owner has entered the Return of every
 * item: Sold = Total − Return, then Amount and Commission from the Item Master values of that
 * moment. The Return becomes the next bill's Fillup. Today's bill is never finalized here. Refused,
 * changing nothing, if a Return is missing or more than the Total.
 */
export async function finalizeBill(salesmanId: string, returns: Record<string, number>, day?: string): Promise<Result> {
  const db = getDatabase();
  if (!db.salesmen.some((s) => s.id === salesmanId)) return { ok: false, error: 'This salesman no longer exists.' };
  const { pending } = salesmanBills(db, salesmanId, todayISO(), day);
  if (!pending) return { ok: false, error: 'No bill is waiting for a Return.' };
  for (const r of pending.rows) {
    const n = returns[r.productId];
    if (n === undefined || !Number.isInteger(n) || n < 0) return { ok: false, error: 'Enter the Return for every item.' };
    if (n > r.fillup + r.addMore) return overLimit('A Return is more than the Total. Please adjust it.');
  }
  return writeBill(buildBill(salesmanId, pending.date, pending.rows, addMoreOf(pending.rows), returns));
}
