import { collection, doc, increment, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';

import type { DirectBill, DirectBillLine, DirectBillPayment } from '../../db/schema';
import { db } from '../firestore';

/** Owner only. Newest first. */
export function subscribeDirectBills(onData: (b: DirectBill[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    collection(db, 'directBills'),
    (snap) => onData(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as DirectBill).sort((a, b) => b.at.localeCompare(a.at))),
    onError,
  );
}

/** Every payment record of every private bill. */
export function subscribeDirectBillPayments(onData: (p: DirectBillPayment[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    collection(db, 'directBillPayments'),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, billId: String(x.billId ?? ''), amount: Number(x.amount ?? 0), at: String(x.at ?? ''), userId: String(x.userId ?? ''), createdAt: typeof x.createdAt?.toDate === 'function' ? x.createdAt.toDate().toISOString() : undefined };
        }),
      ),
    onError,
  );
}

/** A refusal inside a payment transaction (bill missing, already fully paid, or more than is outstanding). Nothing was written. */
export class PaymentRefused extends Error {}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Records one more payment against a bill in ONE transaction: the payment record (directBillPayments/{paymentId}) and the bill's
 * summary (paidAmount, remainingAmount, paymentStatus) are written together, from the bill as the server holds it right now.
 * Two payments racing for the same balance: Firestore commits one and re-runs the other against the new balance, which then
 * refuses if it no longer fits. `paymentId` is fixed per submission: if that record exists the earlier attempt committed, and
 * nothing is written again. Products and warehouse stock are never read or written here.
 */
export async function recordDirectBillPaymentTransaction(billId: string, amount: number, paymentId: string, at: string, userId: string): Promise<void> {
  const billRef = doc(db, 'directBills', billId);
  const paymentRef = doc(db, 'directBillPayments', paymentId);
  await runTransaction(db, async (tx) => {
    if ((await tx.get(paymentRef)).exists()) return; // an earlier attempt of this same submission already committed
    const snap = await tx.get(billRef);
    if (!snap.exists()) throw new PaymentRefused('This bill no longer exists.');
    const total = cents(Number(snap.data().total ?? 0));
    const paid = cents(Number(snap.data().paidAmount ?? 0)); // bills from before payments existed have none: Unpaid
    const outstanding = cents(total - paid);
    if (outstanding <= 0) throw new PaymentRefused('This bill is already fully paid.');
    if (amount > outstanding) throw new PaymentRefused(`Payment cannot be more than the remaining balance of ₹${outstanding}.`);
    const nextPaid = cents(paid + amount);
    const remaining = cents(total - nextPaid);
    tx.update(billRef, { paidAmount: nextPaid, remainingAmount: remaining, paymentStatus: remaining === 0 ? 'paid' : 'partial' });
    tx.set(paymentRef, { billId, amount, at, userId, createdAt: serverTimestamp() });
  });
}

/** A refusal inside the transaction: a product has less stock than the bill needs. Nothing was written. */
export class NotEnoughStockForBill extends Error {}

/**
 * Saves a direct (private) bill and takes its quantities off the warehouse stock in ONE Firestore transaction.
 *
 *   bill:   directBills/{bill.id}            (the id comes from the submission, see below)
 *   stock:  products/{productId}.stock       (the field every stock screen reads)
 *
 * Inside the transaction the bill document and every product are READ first, from the server. If any product holds less
 * than the bill needs (stock minus the units already allocated to salesmen), nothing is written and the whole bill is refused. Otherwise the bill is created and every stock
 * is decremented in the same commit, so there is never a bill without its deduction or the other way round. Two bills
 * competing for the last units: Firestore commits one and re-runs the other with the new stock, which then refuses.
 *
 * Idempotent: the bill id is fixed per submission. If a bill with this id already exists, the earlier attempt committed
 * and nothing is written again (so a retry cannot duplicate the bill or deduct twice).
 */
export async function saveDirectBillTransaction(bill: DirectBill, wanted: Record<string, number>, init: Record<string, number> = {}): Promise<void> {
  const billRef = doc(db, 'directBills', bill.id);
  const ids = Object.keys(wanted);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(billRef);
    if (existing.exists()) return; // already saved by an earlier attempt of this same submission
    const products = await Promise.all(ids.map((id) => tx.get(doc(db, 'products', id))));
    // Units already given to salesmen are not in the warehouse any more, so they cannot be sold here: only stock - allocated is free.
    const allocations = await Promise.all(ids.map((id) => tx.get(doc(db, 'allocations', id))));
    let refusal: string | null = null;
    ids.forEach((id, i) => {
      const snap = products[i];
      const stock = snap.exists() ? Number(snap.data().stock ?? 0) : 0;
      const held = allocations[i].exists() ? Number(allocations[i].data()?.outstanding ?? 0) : (init[id] ?? 0);
      const free = Math.max(0, stock - held);
      if (!snap.exists() || snap.data().active !== true) refusal ??= 'A product in this bill is no longer available.';
      else if (wanted[id] > free) refusal ??= `Not enough stock of ${String(snap.data().name ?? id)}. Only ${free} left${held > 0 ? ` (${held} with salesmen)` : ''}.`;
    });
    if (refusal) {
      // The same submission may have committed between the reads above (that is what took the stock): then there is nothing to refuse, it is already saved.
      if ((await tx.get(billRef)).exists()) return;
      throw new NotEnoughStockForBill(refusal);
    }
    const { id: _id, ...data } = bill;
    tx.set(billRef, { ...data, createdAt: serverTimestamp() });
    // The payment taken with the bill is its first payment record, written in this same commit as the bill and the stock deduction.
    if ((bill.paidAmount ?? 0) > 0) {
      tx.set(doc(db, 'directBillPayments', `${bill.id}_p0`), { billId: bill.id, amount: bill.paidAmount, at: bill.at, userId: bill.userId, createdAt: serverTimestamp() });
    }
    for (const id of ids) tx.update(doc(db, 'products', id), { stock: increment(-wanted[id]), updatedAt: serverTimestamp() });
  });
}

/** A refusal inside the edit transaction (bill missing, total below what is already paid, or a quantity the stock cannot cover). Nothing was written. */
export class EditRefused extends Error {}

export type DirectBillEdit = { customerName: string; customerPhone: string; lines: DirectBillLine[]; total: number; editId: string; at: string; userId: string };

/**
 * Edits a saved private bill in ONE Firestore transaction: the bill document and the warehouse stock move together.
 *
 * The original bill's deduction is reversed and the edited quantities applied as one NET change per product (new qty - old qty), so the
 * stock is never visibly put back in between. Each product with a net increase must fit the free stock (stock - units with salesmen),
 * exactly as when a bill is created. Payments are not touched: paidAmount and the directBillPayments records stay as they are; only
 * Remaining and the status follow the new total, and the total may not drop below what has been paid. Idempotent per edit: the bill
 * remembers the id of the last edit it applied, so a repeated Save of the same edit changes nothing again. Id, `at` and `createdAt` are kept.
 */
export async function editDirectBillTransaction(billId: string, edit: DirectBillEdit, init: Record<string, number> = {}): Promise<void> {
  const billRef = doc(db, 'directBills', billId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(billRef);
    if (!snap.exists()) throw new EditRefused('This bill no longer exists.');
    const cur = snap.data();
    if (cur.lastEditId === edit.editId) return; // an earlier attempt of this same edit already committed
    const sum = (lines: { productId: string; qty: number }[]) => {
      const q: Record<string, number> = {};
      for (const l of lines) q[l.productId] = (q[l.productId] ?? 0) + Number(l.qty);
      return q;
    };
    const was = sum((cur.lines ?? []) as DirectBillLine[]);
    const now = sum(edit.lines);
    const delta: Record<string, number> = {};
    for (const id of new Set([...Object.keys(was), ...Object.keys(now)])) {
      const d = (now[id] ?? 0) - (was[id] ?? 0);
      if (d !== 0) delta[id] = d;
    }
    const ids = Object.keys(delta);
    const paid = cents(Number(cur.paidAmount ?? 0));
    if (edit.total < paid) throw new EditRefused(`The new total (₹${edit.total}) cannot be less than the ₹${paid} already paid on this bill.`);
    const products = await Promise.all(ids.map((id) => tx.get(doc(db, 'products', id))));
    const allocations = await Promise.all(ids.map((id) => tx.get(doc(db, 'allocations', id))));
    ids.forEach((id, i) => {
      if (delta[id] < 0) return; // less sold than before: stock only comes back
      const p = products[i];
      const stock = p.exists() ? Number(p.data().stock ?? 0) : 0;
      const held = allocations[i].exists() ? Number(allocations[i].data()?.outstanding ?? 0) : (init[id] ?? 0);
      const free = Math.max(0, stock - held); // this bill's own units are already out of `stock`, so only the increase must fit
      if (!p.exists() || p.data().active !== true) throw new EditRefused('A product in this bill is no longer available.');
      if (delta[id] > free) throw new EditRefused(`Not enough stock of ${String(p.data().name ?? id)}. Only ${free} more can be added${held > 0 ? ` (${held} with salesmen)` : ''}.`);
    });
    const remaining = cents(edit.total - paid);
    tx.update(billRef, {
      customerName: edit.customerName,
      customerPhone: edit.customerPhone,
      lines: edit.lines,
      total: edit.total,
      remainingAmount: remaining,
      paymentStatus: edit.total > 0 && remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      updatedAt: edit.at,
      updatedBy: edit.userId,
      lastEditId: edit.editId,
    });
    for (const id of ids) tx.update(doc(db, 'products', id), { stock: increment(-delta[id]), updatedAt: serverTimestamp() });
  });
}
