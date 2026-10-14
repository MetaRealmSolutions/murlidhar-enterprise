import type { Href } from 'expo-router';

import type { Permissions, UserProfile } from '../data/db/schema';

// Page-level access for the signed-in user, from their Firestore profile (users/{uid}).
//
//   owner     everything, including Users, Reports, Settings and the Item Master (prices and commissions).
//   employee  only the pages their three permissions switch on: Stock, Private Bills, Salesmen.
//             Never Users, Reports, Settings, Businesses or the Item Master.
//
// IMPORTANT: this is a FRONTEND check. It hides links, guards routes and makes the app refuse owner-only commands, but
// anyone who can call Firestore directly is only limited by the Firestore security rules. Rules that match these roles
// and permissions (owner-only writes to products and users; employee reads/writes limited by `permissions`) must be
// written and deployed before this is used in production.

export type Area = 'stock' | 'privateBills' | 'salesmen';

const FLAG: Record<Area, keyof Permissions> = { stock: 'stockAccess', privateBills: 'privateBillsAccess', salesmen: 'salesmenAccess' };

export const isOwner = (u: UserProfile | null | undefined) => u?.role === 'owner';

/** True for the owner, and for an active employee whose permission for that page is on. */
export function can(u: UserProfile | null | undefined, area: Area): boolean {
  if (!u || !u.active) return false;
  if (u.role === 'owner') return true;
  return u.role === 'employee' && u.permissions?.[FLAG[area]] === true;
}

const HREF: Record<Area, Href> = { stock: '/stock', privateBills: '/private-bills' as Href, salesmen: '/salesmen' };

/** Where an employee starts: the first page they may use, or null when none is switched on. The owner starts at Home. */
export function firstAllowedHref(u: UserProfile | null | undefined): Href | null {
  if (isOwner(u)) return '/';
  for (const a of ['stock', 'privateBills', 'salesmen'] as Area[]) if (can(u, a)) return HREF[a];
  return null;
}
