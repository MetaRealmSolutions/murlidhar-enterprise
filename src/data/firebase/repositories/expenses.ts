import { collection, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

import type { Expense } from '../../db/schema';
import { db } from '../firestore';

/** Owner only. Newest expense date first. */
export function subscribeExpenses(onData: (e: Expense[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    collection(db, 'expenses'),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id,
              title: String(x.title ?? ''),
              amount: Number(x.amount ?? 0),
              date: String(x.date ?? ''),
              notes: String(x.notes ?? ''),
              createdAt: String(x.createdAtIso ?? ''),
              userId: String(x.userId ?? ''),
              updatedAt: typeof x.updatedAtIso === 'string' ? x.updatedAtIso : undefined,
              updatedBy: typeof x.updatedBy === 'string' ? x.updatedBy : undefined,
            } as Expense;
          })
          .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
      ),
    onError,
  );
}

/**
 * Creates an expense once. The id is fixed per submission: if a document with it already exists, an earlier attempt committed and nothing is
 * written again, so a double click or a retry cannot record the expense twice.
 */
export async function createExpenseTransaction(e: Expense): Promise<void> {
  const ref = doc(db, 'expenses', e.id);
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) return;
    tx.set(ref, { title: e.title, amount: e.amount, date: e.date, notes: e.notes, createdAtIso: e.createdAt, userId: e.userId, createdAt: serverTimestamp() });
  });
}

/** Changes the editable fields of an expense (title, amount, date, notes); the creator and creation time stay. */
export async function updateExpenseDoc(id: string, fields: { title: string; amount: number; date: string; notes: string }, at: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'expenses', id), { ...fields, updatedAtIso: at, updatedBy: userId });
}

export async function deleteExpenseDoc(id: string): Promise<void> {
  await deleteDoc(doc(db, 'expenses', id));
}
