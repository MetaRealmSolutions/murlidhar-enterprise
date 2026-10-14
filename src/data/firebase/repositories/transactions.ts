import { collection, doc, documentId, getDocs, onSnapshot, query, serverTimestamp, where, type Transaction as FirestoreTransaction } from 'firebase/firestore';

import type { Transaction } from '../../db/schema';
import { businessDate } from '../../business-date';
import { db } from '../firestore';

/** Firestore rejects `undefined` fields. */
export const stripUndefined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ─── Date-wise transaction schema ──────────────────────────────────────────────────────────────
//
//   transactions/{YYYY-MM-DD}                 a light date document: { date, updatedAt }
//   transactions/{YYYY-MM-DD}/entries/{id}    one transaction (the stock receive ledger line)
//
// The date is the BUSINESS date in India (Asia/Kolkata, UTC+5:30, no daylight saving). Every entry also stores
// `businessDate` (the same string as its parent date document), `createdAt` (a server timestamp) and its own `id`.
// All reads and writes of transactions go through this file, so no screen builds a Firestore path itself.

export { businessDate };

const dateRef = (date: string) => doc(db, 'transactions', date);
const entriesRef = (date: string) => collection(db, 'transactions', date, 'entries');
const entryRef = (date: string, id: string) => doc(db, 'transactions', date, 'entries', id);

/** Adds transactions inside a Firestore transaction (the caller reads first, then calls this). Each goes under its own business date. */
export function setEntries(tx: FirestoreTransaction, entries: Transaction[]) {
  for (const { id, ...data } of entries) {
    const date = data.businessDate ?? businessDate(data.at);
    tx.set(dateRef(date), { date, updatedAt: serverTimestamp() }, { merge: true });
    tx.set(entryRef(date, id), stripUndefined({ ...data, id, date, businessDate: date, createdAt: serverTimestamp() }));
  }
}

const toTransaction = (id: string, data: Record<string, unknown>): Transaction => {
  const { createdAt: _createdAt, ...rest } = data;
  return { ...rest, id } as Transaction;
};

const byTime = (a: Transaction, b: Transaction) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id);

/** Owner only: the stock receive ledger, live. One listener per date that has a date document, so a date appearing or going is picked up on its own. */
export function subscribeTransactions(onData: (t: Transaction[]) => void, onError: (e: unknown) => void) {
  const byDate = new Map<string, Transaction[]>();
  const stops = new Map<string, () => void>();
  let datesLoaded = false;
  const emit = () => {
    // Wait until the date list and the first snapshot of every date have arrived, so the screens never see half the ledger.
    if (!datesLoaded || [...stops.keys()].some((d) => !byDate.has(d))) return;
    onData([...byDate.values()].flat().sort(byTime));
  };
  const stopDates = onSnapshot(
    collection(db, 'transactions'),
    (snap) => {
      const dates = new Set(snap.docs.map((d) => d.id));
      for (const date of dates) {
        if (stops.has(date)) continue;
        stops.set(
          date,
          onSnapshot(
            entriesRef(date),
            (entries) => {
              byDate.set(date, entries.docs.map((d) => toTransaction(d.id, d.data())).filter((t) => t.type === 'RECEIVE_STOCK'));
              emit();
            },
            onError,
          ),
        );
      }
      for (const [date, stop] of [...stops]) {
        if (dates.has(date)) continue;
        stop();
        stops.delete(date);
        byDate.delete(date);
      }
      datesLoaded = true;
      emit();
    },
    onError,
  );
  return () => {
    stopDates();
    stops.forEach((stop) => stop());
    stops.clear();
  };
}

/** One-time read of the transactions between two business dates (inclusive), oldest first. Only the date documents in the range, and their entries, are read. */
export async function getTransactionsBetween(from: string, to: string): Promise<Transaction[]> {
  const dates = await getDocs(query(collection(db, 'transactions'), where(documentId(), '>=', from), where(documentId(), '<=', to)));
  const days = await Promise.all(dates.docs.map((d) => getDocs(entriesRef(d.id))));
  return days.flatMap((s) => s.docs.map((d) => toTransaction(d.id, d.data()))).sort(byTime);
}
