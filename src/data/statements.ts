import { businessDate, istLongStamp, istStamp, istTime } from './business-date';
import { getDatabase } from './db/database';
import type { Database, Product, Settlement } from './db/schema';

// The Salesman Statement: the finalized daily bills of one salesman, date-wise.
//   Total  = Fillup + Add More,   Sold = Total − Return,
//   Amount / Commission = Σ sold × the unit values copied onto the bill.

export type StatementPeriod = 'today' | 'week' | 'month' | 'custom';

export const STATEMENT_PERIODS: { id: StatementPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

export type StatementLine = {
  product: string;
  fillup: number;
  addMore: number;
  total: number; // Fillup + Add More
  returned: number;
  sold: number; // Total − Return
  totalAmount: number;
  totalCommission: number;
};

export type Totals = { sold: number; amount: number; commission: number };

export type StatementDay = {
  date: string;
  billNo?: string;
  village?: string;
  lines: StatementLine[];
  totals: Totals;
};

export type Statement = {
  from: string;
  to: string;
  days: StatementDay[];
  totals: Totals;
};

/** Finalized bills inside [from, to] (inclusive, ISO yyyy-mm-dd), newest day first. */
export function getStatement(salesmanId: string, from: string, to: string, db: Database = getDatabase()): Statement {
  return buildStatement(db.settlements.filter((s) => s.salesmanId === salesmanId), db.products, from, to);
}

/** The statement of the given daily bills: only FINALIZED ones inside [from, to], one per date, newest first. Values come from the saved bill itself. */
export function buildStatement(bills: Settlement[], products: Product[], from: string, to: string): Statement {
  const name = new Map(products.map((p) => [p.id, p.name]));
  const days: StatementDay[] = bills
    .filter((s) => s.finalized && s.statementDay >= from && s.statementDay <= to)
    .sort((a, b) => b.statementDay.localeCompare(a.statementDay))
    .map((s) => {
      const lines = s.lines.map((l) => ({
        product: name.get(l.productId) ?? l.productId,
        fillup: l.carriedOpeningQuantity,
        addMore: l.newFillupQuantity,
        total: l.totalAvailableQuantity,
        returned: l.returnQuantity,
        sold: l.soldQuantity,
        totalAmount: l.soldQuantity * l.unitAmount,
        totalCommission: l.soldQuantity * l.unitCommission,
      }));
      return { date: s.statementDay, lines, totals: sum(lines) };
    });
  return { from, to, days, totals: sum(days.flatMap((d) => d.lines)) };
}

export type BillListRow = { id: string; salesmanId: string; date: string; party: string; commission: number; amount: number };

/**
 * The List of Bill Entry rows: SAVED (finalized) daily bills only, one per salesman and business date, newest date first then Party Name.
 * `partyId` null = every salesman; `from` / `to` are business dates (yyyy-mm-dd, compared as text, so month/year boundaries and the
 * device timezone do not matter) and either may be empty. Commission and Amount are the totals saved with the bill; a bill saved without
 * totals uses the unit values copied onto its own lines, never the current Item Master prices.
 */
export function billListRows(bills: Settlement[], names: Map<string, string>, partyId: string | null, from: string, to: string): BillListRow[] {
  if (from && to && from > to) return [];
  return bills
    .filter((s) => s.finalized && (!partyId || s.salesmanId === partyId) && (!from || s.statementDay >= from) && (!to || s.statementDay <= to))
    .map((s) => {
      const t = s.totals ?? s.lines.reduce((n, l) => ({ amount: n.amount + l.soldQuantity * l.unitAmount, commission: n.commission + l.soldQuantity * l.unitCommission }), { amount: 0, commission: 0 });
      return { id: s.id, salesmanId: s.salesmanId, date: s.statementDay, party: names.get(s.salesmanId) ?? s.salesmanId, commission: t.commission, amount: t.amount };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.party.localeCompare(b.party) || a.id.localeCompare(b.id));
}

function sum(lines: StatementLine[]): Totals {
  return lines.reduce(
    (t, l) => ({ sold: t.sold + l.sold, amount: t.amount + l.totalAmount, commission: t.commission + l.totalCommission }),
    { sold: 0, amount: 0, commission: 0 },
  );
}

/** The business day (yyyy-mm-dd, Asia/Kolkata) of an ISO date-time. Never the browser's own timezone. */
export function localDate(iso: string) {
  return businessDate(iso);
}

/** Today's business date (yyyy-mm-dd, Asia/Kolkata): the day a bill belongs to. */
export const todayISO = () => businessDate();

/** "2026-10-05T17:20:00" → "05 Oct 2026, 5:20 PM" (for submitted / verified stamps). */
export function formatStamp(iso: string) {
  return istStamp(iso);
}

/* ---------- Dates ---------- */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-05" → "05 October 2026" */
export function formatLong(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

export function addDays(iso: string, delta: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Range for a preset period. "This Week" is the last 7 days including today. */
export function presetRange(period: Exclude<StatementPeriod, 'custom'>): { from: string; to: string } {
  if (period === 'today') return { from: todayISO(), to: todayISO() };
  if (period === 'week') return { from: addDays(todayISO(), -6), to: todayISO() };
  return { from: `${todayISO().slice(0, 8)}01`, to: todayISO() };
}

/** "05/10/2026" → "2026-10-05", or null when it is not a real date. */
export function parseInputDate(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "2026-10-05" → "05/10/2026" */
export function toInputDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Auto-insert slashes while typing digits: 05102026 → 05/10/2026 */
export function maskDate(text: string) {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "05 October 2026" or "01 October 2026 – 05 October 2026" */
export function periodText(from: string, to: string) {
  return from === to ? formatLong(from) : `${formatLong(from)} – ${formatLong(to)}`;
}

/** Current real date and time for the "Generated on" line. */
export function generatedOn() {
  return istLongStamp();
}

/** "2026-10-05T17:20:00" → "5:20 PM" */
export function formatTime(iso: string) {
  return istTime(iso);
}
