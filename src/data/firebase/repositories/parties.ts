import { collection, doc, increment, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

import type { Party, Transaction } from '../../db/schema';
import { db } from '../firestore';
import { setEntries } from './transactions';

/** Owner only. The document id is the party's 10-digit mobile number. */
export function subscribeParties(onData: (p: Party[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    collection(db, 'parties'),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? ''), mobile: String(d.data().mobile ?? d.id) }))),
    onError,
  );
}

export const partyRef = (id: string) => doc(db, 'parties', id);

/** Corrects a party's displayed name. The mobile number (its identity) never changes. */
export function writePartyName(id: string, name: string) {
  return updateDoc(partyRef(id), { name, updatedAt: serverTimestamp() });
}

/**
 * Records one stock receipt in ONE transaction: the party (created if its mobile number is new; an existing
 * one is reused untouched), the ledger lines, and the stock increase of each product. The party document id
 * is the mobile number, and the receipt's Paid / Unpaid status is saved with it, so two receipts submitted together can never create two parties, and the commit is
 * all-or-nothing, so stock goes up exactly once per saved receipt (the ids are made before, so a retry of the
 * transaction rewrites the same documents). Returns the party's name as stored.
 */
export async function recordReceipt(
  party: { id: string; name: string },
  txs: Transaction[],
  stock: Record<string, number>,
  payment: { receiptId: string; totalAmount: number; paidAmount: number; at: string },
): Promise<string> {
  const ref = partyRef(party.id);
  const paymentRef = doc(db, 'receiptPayments', payment.receiptId);
  return runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    // This receipt id already has its payment document: an earlier attempt of the same submission committed (its payment record is
    // written in the same commit as the ledger lines and the stock), so there is nothing to write again.
    const already = await tx.get(paymentRef);
    if (already.exists()) return existing.exists() ? String(existing.data().name ?? party.name) : party.name;
    const name = existing.exists() ? String(existing.data().name ?? party.name) : party.name;
    if (!existing.exists()) tx.set(ref, { name, mobile: party.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    setEntries(tx, txs.map((t) => ({ ...t, partyId: party.id, partyName: name })));
    // The receipt's payment summary and its first payment entry, saved in the same commit as the ledger lines and the stock increase
    // (a receipt with no such document is an older, Unpaid one). Stock goes up whatever was paid.
    const userId = txs[0]?.userId ?? 'unknown';
    const remaining = Math.round((payment.totalAmount - payment.paidAmount) * 100) / 100;
    tx.set(paymentRef, {
      paid: remaining === 0,
      totalAmount: payment.totalAmount,
      paidAmount: payment.paidAmount,
      remainingAmount: remaining,
      paymentStatus: remaining === 0 ? 'paid' : payment.paidAmount > 0 ? 'partial' : 'unpaid',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    });
    if (payment.paidAmount > 0) tx.set(doc(db, 'receiptPaymentEntries', `${payment.receiptId}_p0`), { receiptId: payment.receiptId, amount: payment.paidAmount, at: payment.at, userId, createdAt: serverTimestamp() });
    for (const [productId, qty] of Object.entries(stock)) tx.update(doc(db, 'products', productId), { stock: increment(qty), updatedAt: serverTimestamp() });
    return name;
  });
}
