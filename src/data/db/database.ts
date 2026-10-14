import { useSyncExternalStore } from 'react';

import { friendlyError } from '../firebase/errors';
import { subscribeExpenses } from '../firebase/repositories/expenses';
import { subscribeDirectBillPayments, subscribeDirectBills } from '../firebase/repositories/directBills';
import { subscribeReceiptPaymentEntries, subscribeReceiptPayments } from '../firebase/repositories/receiptPayments';
import { subscribeParties } from '../firebase/repositories/parties';
import { subscribeProducts } from '../firebase/repositories/products';
import { subscribeSettlements } from '../firebase/repositories/settlements';
import { subscribeSalesmen } from '../firebase/repositories/salesmen';
import { subscribeTransactions } from '../firebase/repositories/transactions';
import { subscribeUsers } from '../firebase/repositories/users';
import type { Database, UserProfile } from './schema';

// The in-memory copy of the Firestore data the signed-in user is allowed to read. It is filled by
// live listeners (one per collection) and is NOT a database of its own: nothing is saved here.
// Screens read it through `repository.ts` hooks and change data only through its commands, which
// write to Firestore; the listeners then deliver the change back.
//
// What is listened to depends on the role, mirroring the security rules:
//   owner:    everything
//   salesman: active products, their own salesman record and their own bills (salesmen/{id}/dailyBills)

const EMPTY: Database = { users: [], products: [], salesmen: [], transactions: [], settlements: [], directBills: [], directBillPayments: [], parties: [], receiptPayments: [], receiptPaymentEntries: [], expenses: [] };

export type SyncState = { status: 'idle' | 'loading' | 'ready' | 'error'; error: string | null };

let data: Database = EMPTY;
/** The signed-in user's profile (kept current by the auth layer), so repository commands can refuse what the role may not do. */
let activeProfile: UserProfile | null = null;
export const getActiveProfile = () => activeProfile;
export function setActiveProfile(p: UserProfile | null) {
  activeProfile = p;
}
let sync: SyncState = { status: 'idle', error: null };
let stops: (() => void)[] = [];

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const emit = () => listeners.forEach((l) => l());

/** Current data (a new object after every change, so it is safe to use as a React dependency). */
export function getDatabase(): Database {
  return data;
}

/** Re-renders the component whenever the data changes. */
export function useDatabase(): Database {
  return useSyncExternalStore(subscribe, getDatabase, getDatabase);
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, () => sync, () => sync);
}

/** Begins listening for the signed-in profile. `ready` once every collection has delivered its first snapshot. */
export function startSync(profile: UserProfile) {
  stopSync();
  activeProfile = profile;
  // What is listened to follows what the person may read (the Firestore rules say the same): the owner everything; an employee
  // only the collections of the pages their permissions switch on; a salesman their own data.
  const isOwner = profile.role === 'owner';
  const staff = isOwner || profile.role === 'employee';
  const allowed = (k: 'stockAccess' | 'privateBillsAccess' | 'salesmenAccess') => isOwner || (profile.role === 'employee' && profile.permissions?.[k] === true);
  const anyPage = allowed('stockAccess') || allowed('privateBillsAccess') || allowed('salesmenAccess');
  const scope = staff ? {} : { salesmanId: profile.salesmanId ?? '' };
  const waiting = new Set<keyof Database>();
  let failed = false;

  const fail = (e: unknown) => {
    if (failed) return;
    failed = true;
    sync = { status: 'error', error: friendlyError(e, 'Unable to load your data.') };
    emit();
  };
  const feed =
    <K extends keyof Database>(key: K) =>
    (value: Database[K]) => {
      data = { ...data, [key]: value };
      waiting.delete(key);
      if (!failed && waiting.size === 0) sync = { status: 'ready', error: null };
      emit();
    };
  const listen = <K extends keyof Database>(key: K, start: (onData: (v: Database[K]) => void, onError: (e: unknown) => void) => () => void) => {
    waiting.add(key);
    stops.push(start(feed(key), fail));
  };

  data = EMPTY;
  sync = { status: 'loading', error: null };
  emit();

  if (!staff || anyPage) listen('products', (d, e) => subscribeProducts(staff, d, e));
  if (!staff || allowed('salesmenAccess')) {
    listen('salesmen', (d, e) => subscribeSalesmen(scope, d, e));
    listen('settlements', (d, e) => subscribeSettlements(scope, d, e));
  }
  if (allowed('stockAccess')) {
    listen('transactions', subscribeTransactions);
    listen('parties', subscribeParties);
    listen('receiptPayments', subscribeReceiptPayments);
    listen('receiptPaymentEntries', subscribeReceiptPaymentEntries);
  }
  if (allowed('privateBillsAccess')) {
    listen('directBills', subscribeDirectBills);
    listen('directBillPayments', subscribeDirectBillPayments);
  }
  if (isOwner) listen('users', subscribeUsers);
  if (isOwner) listen('expenses', subscribeExpenses); // expenses are the owner's only (see firestore.rules)
  // An employee with no page switched on has nothing to load.
  if (waiting.size === 0) {
    sync = { status: 'ready', error: null };
    emit();
  }
}

/** Stops every listener and forgets the data (used on sign-out so nothing outlives the session). */
export function stopSync() {
  stops.forEach((stop) => stop());
  stops = [];
  data = EMPTY;
  activeProfile = null;
  sync = { status: 'idle', error: null };
  emit();
}
