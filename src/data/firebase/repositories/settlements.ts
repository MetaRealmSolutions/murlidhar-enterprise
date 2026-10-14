import { collection, collectionGroup, doc, documentId, getDocs, increment, onSnapshot, query, runTransaction, serverTimestamp, where, type DocumentData, type Transaction as FirestoreTransaction } from 'firebase/firestore';

import type { Settlement } from '../../db/schema';
import { db } from '../firestore';
import { stripUndefined } from './transactions';

// ─── Date-wise salesman bills ──────────────────────────────────────────────────────────────────
//
//   salesmen/{salesmanId}/dailyBills/{yyyy-mm-dd}
//
// ONE canonical document per salesman and business date (the date is the document id), so saving or confirming
// the same day's bill again replaces that document and can never duplicate it. While `status` is 'open' it is the
// working bill; Confirm Return sets it to 'finalized' (that is what the Statements read). All Firestore paths for
// bills are built here. In the app a bill keeps the id `${salesmanId}_${date}`.

/** The in-app id of a bill. */
export const settlementId = (salesmanId: string, day: string) => `${salesmanId}_${day}`;

/** salesmen/{salesmanId}/dailyBills/{date} */
const billRef = (salesmanId: string, day: string) => doc(db, 'salesmen', salesmanId, 'dailyBills', day);

/** A stored daily bill as the app's Settlement. The owning salesman and date come from the path itself. */
function toSettlement(salesmanId: string, day: string, data: DocumentData): Settlement {
  return { ...data, id: settlementId(salesmanId, day), salesmanId, statementDay: day } as Settlement;
}

/** The owner reads every salesman's bills (one collection-group listener); a salesman only their own. */
export function subscribeSettlements(scope: { salesmanId?: string }, onData: (s: Settlement[]) => void, onError: (e: unknown) => void) {
  if (scope.salesmanId) {
    const id = scope.salesmanId;
    return onSnapshot(collection(db, 'salesmen', id, 'dailyBills'), (snap) => onData(snap.docs.map((d) => toSettlement(id, d.id, d.data()))), onError);
  }
  return onSnapshot(collectionGroup(db, 'dailyBills'), (snap) => onData(snap.docs.map((d) => toSettlement(d.ref.parent.parent?.id ?? String(d.data().salesmanId ?? ''), d.id, d.data()))), onError);
}

/** One salesman's finalized bills between two business dates (inclusive): only that salesman's bills for those dates are read (the date is the document id). */
export async function getFinalizedBills(salesmanId: string, from: string, to: string): Promise<Settlement[]> {
  const snap = await getDocs(query(collection(db, 'salesmen', salesmanId, 'dailyBills'), where(documentId(), '>=', from), where(documentId(), '<=', to)));
  return snap.docs.map((d) => toSettlement(salesmanId, d.id, d.data())).filter((b) => b.finalized);
}

/** A refusal inside the transaction: more stock is asked for than the warehouse can give. Nothing was written. */
/** One product whose requested quantity does not fit: its warehouse stock, what salesmen already hold, and the most that can still be given. */
export type Shortage = { productId: string; name: string; stock: number; allocated: number; max: number };
export class NotEnoughStock extends Error {
  constructor(
    message: string,
    readonly shortages: Shortage[] = [],
  ) {
    super(message);
  }
}
const short = (name: string, available: number, requested: number) => `Not enough ${name} in stock: ${available} available, ${requested} requested.`;

// --- Shared allocation ---------------------------------------------------------------------------
//
//   allocations/{productId} = { outstanding }   units of the product that are WITH salesmen (given, not yet sold)
//
// Warehouse stock (products/{id}.stock) only drops when a bill is finalized (Sold), so the goods salesmen hold are still in
// that figure. What can still be given out is  stock - outstanding.  The counter moves in the same transaction as the event:
//   Save Stock Given        outstanding += quantity           (refused if the quantity is more than stock - outstanding)
//   Confirm Return          outstanding -= Sold               (the Return stays with the salesman as next day's Fillup)
//   Same-day correction     outstanding += delta(given + Fillup) - delta(Sold)
// Every one of them reads the counter first, so two salesmen saving at once cannot both take the last units (the second is
// re-run on the new counter). A product with no counter yet starts from the figure derived from the saved bills (`init`).

const allocRef = (productId: string) => doc(db, 'allocations', productId);

async function readOutstanding(tx: FirestoreTransaction, ids: string[], init: Record<string, number>): Promise<Record<string, number>> {
  const snaps = await Promise.all(ids.map((id) => tx.get(allocRef(id))));
  return Object.fromEntries(ids.map((id, i) => [id, snaps[i].exists() ? Number(snaps[i].data()?.outstanding ?? 0) : (init[id] ?? 0)]));
}

const writeOutstanding = (tx: FirestoreTransaction, productId: string, value: number) =>
  tx.set(allocRef(productId), { outstanding: Math.max(0, value), updatedAt: serverTimestamp() }, { merge: true });

const allocMessage = (name: string, stock: number, outstanding: number) =>
  `Not enough ${name} to give: warehouse stock is ${stock} and ${outstanding} ${outstanding === 1 ? 'unit is' : 'units are'} already with salesmen. You can give a maximum of ${Math.max(0, stock - outstanding)}.`;

/**
 * Saves a bill in ONE Firestore transaction, checking and moving warehouse stock from the server's own figures.
 *
 *  - Stock given is saved only by giveStockTransaction. Here the bill's stock given must be unchanged (a stale screen cannot
 *    change what salesmen hold behind the allocation counter's back).
 *  - Stock leaves the warehouse only when the bill is finalized (Return confirmed): each product's Sold is taken off its
 *    stock AND off its outstanding allocation, once. The stored copy of the bill tells whether it was already finalized, so a
 *    repeated or concurrent confirmation cannot deduct twice, and Sold more than the stock holds is refused.
 */
export async function setSettlementWithStock(s: Settlement, init: Record<string, number> = {}): Promise<void> {
  const ref = billRef(s.salesmanId, s.statementDay);
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref);
    const oldData = old.exists() ? old.data() : null;
    const stored = new Map<string, number>(((oldData?.lines ?? []) as Settlement['lines']).map((l) => [l.productId, Number(l.newFillupQuantity ?? 0)]));
    // A finalized bill is history: it is never rewritten, so it cannot be edited or deducted twice.
    if (oldData?.finalized === true) throw new NotEnoughStock('This bill is already finalized.');

    const take = new Map<string, number>();
    if (s.finalized) {
      for (const l of s.lines) if (l.soldQuantity > 0) take.set(l.productId, (take.get(l.productId) ?? 0) + l.soldQuantity);
    } else {
      const now = new Map(s.lines.map((l) => [l.productId, l.newFillupQuantity]));
      const changed = [...stored].some(([id, was]) => (now.get(id) ?? 0) !== was) || [...now].some(([id, qty]) => qty !== (stored.get(id) ?? 0));
      if (changed) throw new NotEnoughStock('Stock given can only be changed with Save Stock Given. Please reload the bill.');
    }
    const ids = [...take.keys()];
    const products = await Promise.all(ids.map((id) => tx.get(doc(db, 'products', id))));
    const outstanding = await readOutstanding(tx, ids, init);
    ids.forEach((id, i) => {
      const snap = products[i];
      if (!snap.exists()) throw new NotEnoughStock('A product on this bill no longer exists.');
      const stock = Number(snap.data().stock ?? 0);
      const sold = take.get(id) ?? 0;
      if (sold > stock) throw new NotEnoughStock(short(String(snap.data().name ?? id), stock, sold));
    });

    const { id: _id, ...data } = s;
    // The audit trail of stock given is kept whatever else rewrites the bill (a Return draft, Confirm Return).
    const keep = oldData?.stockGiven ? { stockGiven: oldData.stockGiven } : {};
    tx.set(ref, { ...data, ...keep, serverUpdatedAt: serverTimestamp(), lines: data.lines.map((l) => stripUndefined(l)) });
    for (const [pid, qty] of take) {
      tx.update(doc(db, 'products', pid), { stock: increment(-qty), updatedAt: serverTimestamp() });
      writeOutstanding(tx, pid, outstanding[pid] - qty);
    }
  });
}

/**
 * The one sanctioned rewrite of a FINALIZED bill: the owner's same-day correction (the caller only offers it
 * for today's bill; `today` is checked again here). In one transaction it reads the stored bill and the
 * products from the server and
 *   - reverses the stored bill's stock effect and applies the corrected one: each product's stock changes by
 *     (stored Sold − corrected Sold), so repeating the same save changes nothing (no duplicate deduction);
 *   - refuses the save, writing nothing, if the corrected Sold needs more than the stock holds, or if the
 *     Add More newly given is more than the stock holds (checked, not deducted, as when giving goods).
 * The bill document is updated in place (same id, date and finalization stamps).
 */
export async function correctFinalizedSettlement(s: Settlement, today: string, init: Record<string, number> = {}): Promise<void> {
  if (s.statementDay !== today) throw new NotEnoughStock('Only the bill being corrected can be saved.');
  const ref = billRef(s.salesmanId, s.statementDay);
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref);
    if (!old.exists() || old.data().finalized !== true) throw new NotEnoughStock('This bill is not finalized.');
    const oldLines = old.data().lines as Settlement['lines'];
    const sum = (lines: Settlement['lines'], pick: (l: Settlement['lines'][number]) => number) => {
      const m = new Map<string, number>();
      for (const l of lines) m.set(l.productId, (m.get(l.productId) ?? 0) + pick(l));
      return m;
    };
    const oldSold = sum(oldLines, (l) => Number(l.soldQuantity ?? 0));
    const newSold = sum(s.lines, (l) => l.soldQuantity);
    // Goods given = the opening Fillup + Add More, so raising either one in a correction is checked as new stock given.
    const oldAdd = sum(oldLines, (l) => Number(l.carriedOpeningQuantity ?? 0) + Number(l.newFillupQuantity ?? 0));
    const newAdd = sum(s.lines, (l) => l.carriedOpeningQuantity + l.newFillupQuantity);
    const ids = [...new Set([...oldSold.keys(), ...newSold.keys()])];
    const allIds = [...new Set([...ids, ...oldAdd.keys(), ...newAdd.keys()])];
    const products = await Promise.all(allIds.map((id) => tx.get(doc(db, 'products', id))));
    const outstanding = await readOutstanding(tx, allIds, init);
    const moves: [string, number][] = [];
    const allocation: [string, number][] = [];
    const refused: Shortage[] = [];
    allIds.forEach((id, i) => {
      const snap = products[i];
      if (!snap.exists()) throw new NotEnoughStock('A product on this bill no longer exists.');
      const stock = Number(snap.data().stock ?? 0);
      const name = String(snap.data().name ?? id);
      // More given (Fillup or Add More raised) must fit what is still free: stock - what all salesmen already hold.
      const given = (newAdd.get(id) ?? 0) - (oldAdd.get(id) ?? 0);
      if (given > 0 && given > stock - outstanding[id]) refused.push({ productId: id, name, stock, allocated: outstanding[id], max: Math.max(0, stock - outstanding[id]) });
      const take = (newSold.get(id) ?? 0) - (oldSold.get(id) ?? 0);
      if (take > stock) throw new NotEnoughStock(short(name, stock, take));
      if (take !== 0) moves.push([id, take]);
      if (given - take !== 0) allocation.push([id, outstanding[id] + given - take]);
    });
    if (refused.length > 0) throw new NotEnoughStock(refused.map((r) => allocMessage(r.name, r.stock, r.allocated)).join('\n'), refused);
    // The correction trail: what this save changed in Sold per product (only when something changed, so repeating a save adds nothing).
    const changed = Object.fromEntries(moves.map(([pid, take]) => [pid, take]));
    const trail = (old.data().corrections ?? []) as unknown[];
    const corrections = moves.length > 0 ? [...trail, { id: `corr_${s.updatedAt}`, at: s.updatedAt, items: changed }] : trail;
    const { id: _id, createdAt, finalizedAt, finalizedBy, stockGiven: _sg, corrections: _co, ...data } = s;
    const kept = old.data().stockGiven ? { stockGiven: old.data().stockGiven } : {};
    tx.set(ref, { ...data, ...kept, corrections, serverUpdatedAt: serverTimestamp(), createdAt: old.data().createdAt ?? createdAt, finalizedAt: old.data().finalizedAt ?? finalizedAt, finalizedBy: old.data().finalizedBy ?? finalizedBy, lines: data.lines.map((l) => stripUndefined(l)) });
    for (const [pid, take] of moves) tx.update(doc(db, 'products', pid), { stock: increment(-take), updatedAt: serverTimestamp() });
    for (const [pid, value] of allocation) writeOutstanding(tx, pid, value);
  });
}

/**
 * Adds stock given today to the bill, ONCE per operation, in one transaction.
 *
 * `operation.id` is unique per Save Stock Given. The stored bill keeps the ids it has applied (`stockGiven`), so the same
 * operation sent again (double click, retry after a dropped connection) changes nothing. Each product's Add More becomes
 * the stored Add More + the quantity given (read from the server, never from the screen), and its Fillup stays the Return
 * carried in, so Fillup shown = carried + Add More saved so far. The salesman's whole holding must fit the warehouse stock,
 * which is only checked here, never changed. `s` is the bill as the screen knows it (its lines supply each product's carried Fillup).
 */
export async function giveStockTransaction(s: Settlement, operation: { id: string; at: string; salesmanName: string; items: Record<string, number> }, init: Record<string, number> = {}): Promise<void> {
  const ref = billRef(s.salesmanId, s.statementDay);
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref);
    const oldData = old.exists() ? old.data() : null;
    if (oldData?.finalized === true) throw new NotEnoughStock('This bill is already finalized.');
    const applied = (oldData?.stockGiven ?? []) as { id: string }[];
    if (applied.some((o) => o.id === operation.id)) return; // already applied: nothing to add again

    const lines = new Map<string, Settlement['lines'][number]>(((oldData?.lines ?? []) as Settlement['lines']).map((l) => [l.productId, l]));
    for (const l of s.lines) if (operation.items[l.productId] !== undefined && !lines.has(l.productId)) lines.set(l.productId, { ...l, newFillupQuantity: 0, totalAvailableQuantity: l.carriedOpeningQuantity });
    const ids = Object.keys(operation.items);
    const products = await Promise.all(ids.map((id) => tx.get(doc(db, 'products', id))));
    const outstanding = await readOutstanding(tx, ids, init);
    const names: Record<string, string> = {};
    const refused: Shortage[] = [];
    ids.forEach((id, i) => {
      const line = lines.get(id);
      const snap = products[i];
      if (!line || !snap.exists()) throw new NotEnoughStock('A product on this bill no longer exists.');
      const stock = Number(snap.data().stock ?? 0);
      // The quantity must fit what is still free across ALL salesmen: stock - what they already hold. Every product that does not fit is reported.
      if (operation.items[id] > stock - outstanding[id]) refused.push({ productId: id, name: String(snap.data().name ?? id), stock, allocated: outstanding[id], max: Math.max(0, stock - outstanding[id]) });
      names[id] = String(snap.data().name ?? id);
      const add = line.newFillupQuantity + operation.items[id];
      lines.set(id, { ...line, newFillupQuantity: add, totalAvailableQuantity: line.carriedOpeningQuantity + add });
    });
    if (refused.length > 0) throw new NotEnoughStock(refused.map((r) => allocMessage(r.name, r.stock, r.allocated)).join('\n'), refused);

    const { id: _id, totals: _totals, ...data } = s;
    tx.set(ref, {
      ...data,
      createdAt: oldData?.createdAt ?? s.createdAt,
      serverUpdatedAt: serverTimestamp(),
      lines: [...lines.values()].map((l) => stripUndefined(l)),
      stockGiven: [...applied, { id: operation.id, at: operation.at, items: operation.items }],
    });
    for (const id of ids) writeOutstanding(tx, id, outstanding[id] + operation.items[id]);
    // One activity record per product and operation (id = operation + product), written with the bill so a failed save leaves none and a repeat cannot add a second.
    for (const id of ids) {
      const activityId = `${operation.id}_${id}`;
      tx.set(doc(db, 'salesmen', s.salesmanId, 'activities', activityId), {
        activityId,
        salesmanId: s.salesmanId,
        salesmanName: operation.salesmanName,
        type: 'STOCK_GIVEN',
        businessDate: s.statementDay,
        at: operation.at,
        createdAt: serverTimestamp(),
        productId: id,
        productName: names[id],
        quantity: operation.items[id],
        dailyBillId: s.statementDay,
        operationId: operation.id,
      });
    }
  });
}

/** A stock-given activity: one product given to a salesman in one Save Stock Given. */
export type Activity = { activityId: string; salesmanId: string; salesmanName: string; type: 'STOCK_GIVEN'; businessDate: string; at: string; productId: string; productName: string; quantity: number; dailyBillId: string; operationId: string };

/** One salesman's stock-given activities between two business dates (inclusive), newest first. Only that salesman's activities in the range are read. */
export async function getActivities(salesmanId: string, from: string, to: string): Promise<Activity[]> {
  const snap = await getDocs(query(collection(db, 'salesmen', salesmanId, 'activities'), where('businessDate', '>=', from), where('businessDate', '<=', to)));
  return snap.docs.map((d) => d.data() as Activity).sort((a, b) => b.at.localeCompare(a.at) || b.activityId.localeCompare(a.activityId));
}
