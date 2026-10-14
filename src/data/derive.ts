import type { Database } from './db/schema';
import { addDays, formatLong, localDate } from './statements';

// Pure functions over a Database snapshot.

export type StockMap = Record<string, number>;

/**
 * Warehouse (master) stock per product: the product's own `stock` field. Stock receipts and direct
 * bills change that field themselves (receipts mark `stockApplied`), so they are not counted again
 * here; an older receipt written before that is still added so the figure is the same. Salesman
 * bills change it only when a bill is finalized (its Sold comes off), in the transaction that saves the bill.
 */
export function warehouseStock(db: Database): StockMap {
  const out: StockMap = {};
  for (const p of db.products) out[p.id] = p.stock;
  for (const t of db.transactions) {
    if (t.type === 'RECEIVE_STOCK' && t.note !== 'Opening stock' && !t.stockApplied) out[t.productId] = (out[t.productId] ?? 0) + t.qty;
  }
  return out;
}

/**
 * Units of each product that are with salesmen right now, derived from the persisted bills: for each salesman, the Return of
 * their latest FINALIZED bill (what they carried on) plus the stock given on every bill after it that is not finalized yet.
 * This is what the shared allocation counter (allocations/{productId}.outstanding) tracks; it is used to start that counter
 * for a product that has none, and by the rebuild script. Warehouse stock only drops when a bill is finalized (Sold), so
 * stock - outstanding is what can still be given out.
 */
export function outstandingByProduct(db: Database): StockMap {
  const out: StockMap = {};
  const bySalesman = new Map<string, Database['settlements']>();
  for (const s of db.settlements) bySalesman.set(s.salesmanId, [...(bySalesman.get(s.salesmanId) ?? []), s]);
  for (const bills of bySalesman.values()) {
    const sorted = [...bills].sort((a, b) => a.statementDay.localeCompare(b.statementDay));
    const lastFinal = [...sorted].reverse().find((b) => b.finalized);
    for (const l of lastFinal?.lines ?? []) if (l.returnQuantity > 0) out[l.productId] = (out[l.productId] ?? 0) + l.returnQuantity;
    for (const b of sorted) {
      if (b.finalized || (lastFinal && b.statementDay <= lastFinal.statementDay)) continue;
      for (const l of b.lines) if (l.newFillupQuantity > 0) out[l.productId] = (out[l.productId] ?? 0) + l.newFillupQuantity;
    }
  }
  return out;
}

/** One product on a salesman's bill. Fillup is the previous bill's Return; Add More is typed that day. */
export type OpenBillRow = { productId: string; fillup: number; addMore: number; /** A Return typed and saved before the bill is finalized. */ returned?: number };
export type BillState = { date: string; rows: OpenBillRow[] };

/**
 * A salesman's two live bills (a finalized bill is history and is never edited).
 *
 *   current = today's bill. Fillup + Add More = Total are editable all day. Its Return is entered when the goods are back:
 *             the goods come back tomorrow. Dated today (or the day after a finalized bill that is
 *             dated today or later, so older records never collide with it).
 *   pending = the oldest earlier bill that is not finalized yet: it is waiting for its Return.
 *             The owner enters that Return now; Sold, Amount and Commission are worked out from it
 *             and the bill is then finalized. null when nothing is waiting.
 *
 * Fillup of any bill = the Return of the bill before it (typed so far, if that one is still pending).
 * Bills with nothing on them are ignored.
 */
export function salesmanBills(db: Database, salesmanId: string, today: string, day?: string): { current: BillState; pending: BillState | null } {
  const docs = db.settlements
    .filter((s) => s.salesmanId === salesmanId && (s.finalized || s.lines.length > 0))
    .sort((a, b) => a.statementDay.localeCompare(b.statementDay));
  const open = docs.filter((s) => !s.finalized);
  const currentDoc = [...open].reverse().find((s) => s.statementDay >= today);
  const last = docs[docs.length - 1];
  const lastFinal = [...docs].reverse().find((s) => s.finalized);
  const derived = currentDoc?.statementDay ?? (last?.finalized ? (addDays(last.statementDay, 1) > today ? addDays(last.statementDay, 1) : today) : today);
  // The owner may work on the bill of a chosen `day` (enter its Return) instead of the derived one, but only where the books stay in order:
  // after the last finalized bill (never behind it, so no later record or carried Fillup is rewritten), with no later bill already started,
  // Past and future dates are alike: a later bill that is already started does not block an earlier date, because the Fillup of every bill is
  // derived from the last confirmed Return before it and the shared allocation counter only adds and subtracts.
  const workable = day !== undefined && (!lastFinal || day > lastFinal.statementDay);
  const date = workable ? (day as string) : derived;
  const chosenDoc = workable ? open.find((s) => s.statementDay === date) : currentDoc;
  const pendingDoc = open.find((s) => s.statementDay < date);

  const order = new Map(db.products.map((p, i) => [p.id, i]));
  const rowsFor = (day: string, doc?: (typeof docs)[number]): OpenBillRow[] => {
    // Opening Fillup = the Return of the most recent CONFIRMED (finalized) bill before this date, however many days ago: days with no bill are
    // simply skipped (no placeholder bill is needed), a bill still waiting for its Return is never a source, and Returns are not added up.
    // A product that is not on that bill, or was returned as 0, opens at 0.
    const before = [...docs].reverse().find((s) => s.finalized && s.statementDay < day);
    const fillup = new Map<string, number>();
    for (const l of before?.lines ?? []) if (l.returnQuantity > 0) fillup.set(l.productId, l.returnQuantity);
    const addMore = new Map<string, number>();
    const drafts = new Map<string, number>();
    for (const l of doc?.lines ?? []) {
      addMore.set(l.productId, l.newFillupQuantity);
      if (l.returnEntered) drafts.set(l.productId, l.returnQuantity);
    }
    const ids = [...new Set([...fillup.keys(), ...addMore.keys()])].filter((id) => order.has(id) && (fillup.get(id) ?? 0) + (addMore.get(id) ?? 0) > 0);
    ids.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
    return ids.map((productId) => ({ productId, fillup: fillup.get(productId) ?? 0, addMore: addMore.get(productId) ?? 0, returned: drafts.get(productId) }));
  };

  return {
    current: { date, rows: rowsFor(date, chosenDoc) },
    pending: pendingDoc ? { date: pendingDoc.statementDay, rows: rowsFor(pendingDoc.statementDay, pendingDoc) } : null,
  };
}

/**
 * What a salesman would open `day` with, whether or not a bill exists for it (read-only; nothing is created or saved). Fillup = the Return of the
 * most recent CONFIRMED (finalized) bill before `day` (the same carry-forward rule as salesmanBills); Add More = what an unfinalized bill of that
 * day already holds, else 0. Products with nothing held are simply absent (they show 0).
 */
export function billPreview(db: Database, salesmanId: string, day: string): Record<string, { fillup: number; addMore: number }> {
  const docs = db.settlements.filter((s) => s.salesmanId === salesmanId && (s.finalized || s.lines.length > 0));
  const before = docs.filter((s) => s.finalized && s.statementDay < day).sort((a, b) => b.statementDay.localeCompare(a.statementDay))[0];
  const own = docs.find((s) => !s.finalized && s.statementDay === day);
  const out: Record<string, { fillup: number; addMore: number }> = {};
  for (const l of before?.lines ?? []) if (l.returnQuantity > 0) out[l.productId] = { fillup: l.returnQuantity, addMore: 0 };
  for (const l of own?.lines ?? []) out[l.productId] = { fillup: out[l.productId]?.fillup ?? 0, addMore: l.newFillupQuantity };
  return out;
}

/** Today's bill (see salesmanBills). */
export function openBill(db: Database, salesmanId: string, today: string): BillState {
  return salesmanBills(db, salesmanId, today).current;
}

/** What one salesman carries right now: the Total (Fillup + Add More) of today's bill. */
export function salesmanHolding(db: Database, salesmanId: string, today: string): StockMap {
  const out: StockMap = {};
  for (const r of openBill(db, salesmanId, today).rows) if (r.fillup + r.addMore > 0) out[r.productId] = r.fillup + r.addMore;
  return out;
}

/** Amount and commission of a finalized bill: Σ sold × the unit values copied onto the bill. */
export function billTotals(lines: { soldQuantity: number; unitAmount: number; unitCommission: number }[]) {
  return lines.reduce(
    (t, l) => ({ sold: t.sold + l.soldQuantity, amount: t.amount + l.soldQuantity * l.unitAmount, commission: t.commission + l.soldQuantity * l.unitCommission }),
    { sold: 0, amount: 0, commission: 0 },
  );
}

/**
 * Sold, amount and commission of the bills finalized ON one day (a bill is finalized the day after its own day, when its Return comes in) (one salesman's, or everyone's when
 * `salesmanId` is omitted), plus what the direct bills of that day came to.
 */
export function salesTotals(db: Database, date: string, salesmanId?: string) {
  return salesTotalsBetween(db, date, date, salesmanId);
}

/** The same figures for every day from `from` to `to` inclusive (yyyy-mm-dd compared as text). Each saved bill is counted once, from its own saved values. */
export function salesTotalsBetween(db: Database, from: string, to: string, salesmanId?: string): { sold: number; amount: number; commission: number; direct: number } {
  const out = { sold: 0, amount: 0, commission: 0, direct: 0 };
  const within = (d: string) => d >= from && d <= to;
  for (const s of db.settlements) {
    if (!s.finalized || !within(localDate(s.finalizedAt)) || (salesmanId !== undefined && s.salesmanId !== salesmanId)) continue;
    const t = billTotals(s.lines);
    out.sold += t.sold;
    out.amount += t.amount;
    out.commission += t.commission;
  }
  if (salesmanId === undefined) for (const b of db.directBills) if (within(b.date)) out.direct += b.total;
  return out;
}

/**
 * What was actually paid to suppliers from `from` to `to` inclusive (business dates): the sum of the payment entries
 * (receiptPaymentEntries, one per payment made against a stock receipt) dated in the period. Each payment is counted once, on the day it was
 * made; a purchase amount that is still unpaid is not a payment.
 */
export function supplierPaidBetween(db: Database, from: string, to: string): number {
  const total = db.receiptPaymentEntries.reduce((n, e) => {
    const day = localDate(e.at);
    return day >= from && day <= to ? n + e.amount : n;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** The expenses dated from `from` to `to` inclusive (business dates, compared as text), summed once each. */
export function expensesBetween(db: Database, from: string, to: string): number {
  const total = db.expenses.reduce((n, e) => (e.date >= from && e.date <= to ? n + e.amount : n), 0);
  return Math.round(total * 100) / 100;
}

export type ActivityItem = { id: string; at: string; text: string };

/** Newest first: stock received (one line per receipt), salesman bills finalized and direct bills. */
export function recentActivity(db: Database, limit: number): ActivityItem[] {
  const name = new Map(db.products.map((p) => [p.id, p.name]));
  const who = new Map(db.salesmen.map((s) => [s.id, s.name]));
  const receipts = new Map<string, { at: string; party: string; lines: { name: string; qty: number }[] }>();
  for (const t of db.transactions) {
    if (t.note === 'Opening stock') continue;
    const key = t.receiptId ?? `${t.at}|${t.userId}`;
    const g = receipts.get(key) ?? { at: t.at, party: t.partyName ?? '', lines: [] };
    g.lines.push({ name: name.get(t.productId) ?? t.productId, qty: t.qty });
    receipts.set(key, g);
  }
  const items: ActivityItem[] = [...receipts.entries()].map(([key, g]) => {
    const units = g.lines.reduce((n, l) => n + l.qty, 0);
    const what = g.lines.length === 1 ? `${g.lines[0].name} × ${units}` : `${g.lines.length} products · ${units} units`;
    return { id: `R|${key}`, at: g.at, text: `Stock received${g.party ? ` from ${g.party}` : ''}: ${what}` };
  });
  for (const s of db.settlements) {
    if (s.finalized) items.push({ id: `B|${s.id}`, at: s.finalizedAt, text: `${who.get(s.salesmanId) ?? 'A salesman'}'s bill finalized` });
  }
  for (const b of db.directBills) items.push({ id: `D|${b.id}`, at: b.at, text: b.customerName ? `Direct bill for ${b.customerName}` : 'Direct bill' });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/**
 * One warehouse stock movement for the Stock History report. `in` and `out` are the units that entered or left the WAREHOUSE.
 * Stock given to a salesman is not a movement (it leaves the warehouse stock only when it is sold).
 */
export type MovementRow = { id: string; at: string; type: 'Received' | 'Private Bill' | 'Salesman Sold' | 'Sold Correction'; product: string; in: number; out: number; ref: string; party: string; by: string };

/**
 * Every warehouse stock change, each from its own source record:
 *   Received         the receipt lines in the transactions ledger            (stock in)
 *   Private Bill     the private bill (directBills)                          (stock out)
 *   Salesman Sold    a finalized daily bill, at its confirmation time        (stock out: its Sold less any later correction)
 *   Sold Correction  one row per same-day correction that changed Sold       (stock out when Sold went up, in when it went down)
 * A correction is its own row and the original Sold row is shown WITHOUT it, so original + corrections = the corrected Sold and
 * nothing is counted twice. Bills finalized before corrections were recorded simply show their (corrected) Sold once. Nothing is invented.
 */
export function movementRows(db: Database): MovementRow[] {
  const product = new Map(db.products.map((p) => [p.id, p.name]));
  const user = new Map(db.users.map((u) => [u.id, u.name]));
  const salesman = new Map(db.salesmen.map((s) => [s.id, s.name]));
  const name = (id: string) => product.get(id) ?? id;
  const rows: MovementRow[] = [];
  for (const t of db.transactions) {
    if (t.type !== 'RECEIVE_STOCK' || t.note === 'Opening stock') continue;
    rows.push({ id: t.id, at: t.at, type: 'Received', product: name(t.productId), in: t.qty, out: 0, ref: `Receipt ${(t.receiptId ?? t.id).slice(-6)}`, party: t.partyName ?? '', by: user.get(t.userId) ?? '' });
  }
  for (const b of db.directBills) {
    for (const l of b.lines) rows.push({ id: `${b.id}|${l.productId}`, at: b.at, type: 'Private Bill', product: l.name, in: 0, out: l.qty, ref: `Bill ${b.id.slice(-6)}`, party: b.customerName, by: user.get(b.userId) ?? '' });
  }
  for (const s of db.settlements) {
    if (!s.finalized) continue;
    const who = salesman.get(s.salesmanId) ?? s.salesmanId;
    const ref = `${who} · ${formatLong(s.statementDay)}`;
    const delta = new Map<string, number>();
    for (const c of s.corrections ?? []) {
      for (const [pid, d] of Object.entries(c.items)) delta.set(pid, (delta.get(pid) ?? 0) + d);
      for (const [pid, d] of Object.entries(c.items)) {
        rows.push({ id: `${s.id}|${c.id}|${pid}`, at: c.at, type: 'Sold Correction', product: name(pid), in: d < 0 ? -d : 0, out: d > 0 ? d : 0, ref, party: who, by: user.get(s.finalizedBy) ?? '' });
      }
    }
    for (const l of s.lines) {
      const original = l.soldQuantity - (delta.get(l.productId) ?? 0);
      if (original > 0) rows.push({ id: `${s.id}|${l.productId}`, at: s.finalizedAt || s.updatedAt, type: 'Salesman Sold', product: name(l.productId), in: 0, out: original, ref, party: who, by: user.get(s.finalizedBy) ?? '' });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
