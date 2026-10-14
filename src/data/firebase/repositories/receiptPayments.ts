import { collection, doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';

import type { ReceiptPayment, ReceiptPaymentEntry } from '../../db/schema';
import { auth } from '../auth';
import { db } from '../firestore';

/** Owner only. The document id is the receipt's id. */
export function subscribeReceiptPayments(onData: (p: ReceiptPayment[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    collection(db, 'receiptPayments'),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, paid: x.paid === true, ...(typeof x.totalAmount === 'number' ? { totalAmount: x.totalAmount, paidAmount: Number(x.paidAmount ?? 0) } : {}) };
        }),
      ),
    onError,
  );
}

/** Every payment made against any receipt. */
export function subscribeReceiptPaymentEntries(onData: (p: ReceiptPaymentEntry[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    collection(db, 'receiptPaymentEntries'),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, receiptId: String(x.receiptId ?? ''), amount: Number(x.amount ?? 0), at: String(x.at ?? ''), userId: String(x.userId ?? ''), createdAt: typeof x.createdAt?.toDate === 'function' ? x.createdAt.toDate().toISOString() : undefined };
        }),
      ),
    onError,
  );
}

/** Sets one receipt's payment status (only that receipt's document; stock and the ledger are not touched). */
export function writeReceiptPaid(receiptId: string, paid: boolean) {
  return setDoc(doc(db, 'receiptPayments', receiptId), { paid, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid ?? 'unknown' }, { merge: true });
}

/** A refusal inside a receipt-payment transaction. Nothing was written. */
export class ReceiptPaymentRefused extends Error {}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Records one more payment to the supplier against ONE receipt, in ONE transaction: the entry (receiptPaymentEntries/{entryId}) and the
 * receipt's summary (paidAmount, remainingAmount, paymentStatus, paid) are written together, from the summary as the server holds it
 * now. Racing payments: Firestore commits one and re-runs the other against the new balance. `entryId` is fixed per submission: if the
 * entry exists the earlier attempt committed and nothing is written again. Products and stock are never read or written here.
 */
export async function recordReceiptPaymentTransaction(receiptId: string, amount: number, entryId: string, at: string, userId: string): Promise<void> {
  const summaryRef = doc(db, 'receiptPayments', receiptId);
  const entryRef = doc(db, 'receiptPaymentEntries', entryId);
  await runTransaction(db, async (tx) => {
    if ((await tx.get(entryRef)).exists()) return;
    const snap = await tx.get(summaryRef);
    const total = snap.exists() && typeof snap.data().totalAmount === 'number' ? cents(snap.data().totalAmount) : null;
    if (total === null) throw new ReceiptPaymentRefused('No purchase amount was recorded for this older receipt.');
    const paid = cents(Number(snap.data()?.paidAmount ?? 0));
    const outstanding = cents(total - paid);
    if (outstanding <= 0) throw new ReceiptPaymentRefused('This receipt is already fully paid.');
    if (amount > outstanding) throw new ReceiptPaymentRefused(`Payment cannot be more than the remaining balance of ₹${outstanding}.`);
    const nextPaid = cents(paid + amount);
    const remaining = cents(total - nextPaid);
    tx.update(summaryRef, { paidAmount: nextPaid, remainingAmount: remaining, paymentStatus: remaining === 0 ? 'paid' : 'partial', paid: remaining === 0, updatedAt: serverTimestamp(), updatedBy: userId });
    tx.set(entryRef, { receiptId, amount, at, userId, createdAt: serverTimestamp() });
  });
}
