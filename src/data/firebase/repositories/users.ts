import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, type DocumentData } from 'firebase/firestore';

import type { Permissions, UserProfile } from '../../db/schema';
import { db } from '../firestore';

/** Roles the app understands. Anything else in Firestore is refused. */
const ROLES = ['owner', 'salesman', 'employee'] as const;

/** A users/{uid} document as a profile, or null when its role is not one the app knows. */
export function parseProfile(id: string, d: DocumentData): UserProfile | null {
  if (!ROLES.includes(d.role)) return null;
  return {
    id,
    email: String(d.email ?? ''),
    name: String(d.name ?? ''),
    role: d.role,
    active: d.active === true,
    phone: typeof d.phone === 'string' ? d.phone : undefined,
    salesmanId: typeof d.salesmanId === 'string' ? d.salesmanId : undefined,
    permissions: d.role === 'employee' ? { stockAccess: d.permissions?.stockAccess === true, privateBillsAccess: d.permissions?.privateBillsAccess === true, salesmenAccess: d.permissions?.salesmenAccess === true } : undefined,
  };
}

/** users/{uid}: undefined when the document does not exist, null when its role is unknown. */
export async function fetchUserProfile(uid: string): Promise<UserProfile | null | undefined> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? parseProfile(snap.id, snap.data()) : undefined;
}

/** Owner only: every user profile. */
export function subscribeUsers(onData: (users: UserProfile[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    collection(db, 'users'),
    (snap) => onData(snap.docs.flatMap((d) => parseProfile(d.id, d.data()) ?? [])),
    onError,
  );
}

/** Live copy of the signed-in user's own profile, so a permission change reaches them without signing in again. */
export function subscribeUserProfile(uid: string, onData: (p: UserProfile | null | undefined) => void, onError: (e: unknown) => void) {
  return onSnapshot(doc(db, 'users', uid), (snap) => onData(snap.exists() ? parseProfile(snap.id, snap.data()) : undefined), onError);
}

/** Owner only: the profile of a newly created Employee login (users/{uid}). No password is ever stored. */
export function writeEmployeeProfile(uid: string, p: { name: string; email: string; permissions: Permissions }) {
  return setDoc(doc(db, 'users', uid), { name: p.name, email: p.email, role: 'employee', active: true, permissions: p.permissions, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

/** Owner only: changes an Employee's name, permissions or active flag. The role and login never change here. */
export function updateEmployeeProfile(uid: string, p: { name: string; permissions: Permissions; active: boolean }) {
  return updateDoc(doc(db, 'users', uid), { name: p.name, permissions: p.permissions, active: p.active, updatedAt: serverTimestamp() });
}
