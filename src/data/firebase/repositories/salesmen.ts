import { collection, doc, onSnapshot, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore';

import type { Salesman } from '../../db/schema';
import { db } from '../firestore';

const toSalesman = (id: string, x: DocumentData): Salesman => ({
  id,
  name: String(x.name ?? ''),
  phone: String(x.phone ?? ''),
  details: typeof x.details === 'string' ? x.details : undefined,
  active: x.active === true,
});

/** The owner reads every salesman; a salesman only their own record. */
export function subscribeSalesmen(scope: { salesmanId?: string }, onData: (s: Salesman[]) => void, onError: (e: unknown) => void) {
  if (scope.salesmanId) {
    return onSnapshot(doc(db, 'salesmen', scope.salesmanId), (snap) => onData(snap.exists() ? [toSalesman(snap.id, snap.data())] : []), onError);
  }
  return onSnapshot(
    collection(db, 'salesmen'),
    (snap) => onData(snap.docs.map((d) => toSalesman(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name))),
    onError,
  );
}

export function writeSalesman(s: { id: string; name: string; phone: string; isNew: boolean }) {
  return setDoc(
    doc(db, 'salesmen', s.id),
    { name: s.name, phone: s.phone, ...(s.isNew ? { active: true, createdAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Takes a salesman off every list without touching their history, bills, holdings or sign-in account. */
export function archiveSalesman(id: string) {
  return setDoc(doc(db, 'salesmen', id), { active: false, updatedAt: serverTimestamp() }, { merge: true });
}
