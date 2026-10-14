import type { Database } from './db/schema';

// Product Sales Analysis: read-only figures over the salesman bills already loaded. Nothing is stored or written.
//   - Only FINALIZED bills count (open / draft bills have no confirmed Sold).
//   - A bill belongs to its own business date (statementDay), the same date the List of Bill Entry uses, compared as text (inclusive).
//   - A finalized bill is ONE document per salesman and day that a correction rewrites in place, so a corrected bill is counted once, as corrected.
//   - Units = the saved Sold quantity; Amount / Commission = Sold × the unit values saved on that bill's own line (never today's Item Master prices).
//   - Private Bills are not read here.

export type SalesFigures = { units: number; amount: number; commission: number };
export type ProductSalesRow = SalesFigures & { id: string; name: string };
export type ProductSales = { totals: SalesFigures; products: ProductSalesRow[]; salesmen: ProductSalesRow[] };

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * `productIds` / `salesmanIds` null = all of them; they combine with the date range. Rows with no units sold are left out; both lists are
 * ranked by units sold, then amount, then name.
 */
export function productSales(db: Database, from: string, to: string, productIds: string[] | null, salesmanIds: string[] | null = null): ProductSales {
  const chosen = productIds ? new Set(productIds) : null;
  const who = salesmanIds ? new Set(salesmanIds) : null;
  const productName = new Map(db.products.map((p) => [p.id, p.name]));
  const salesmanName = new Map(db.salesmen.map((s) => [s.id, s.name]));
  const byProduct = new Map<string, SalesFigures>();
  const bySalesman = new Map<string, SalesFigures>();
  const totals: SalesFigures = { units: 0, amount: 0, commission: 0 };
  const add = (m: Map<string, SalesFigures>, key: string, units: number, amount: number, commission: number) => {
    const f = m.get(key) ?? { units: 0, amount: 0, commission: 0 };
    f.units += units;
    f.amount += amount;
    f.commission += commission;
    m.set(key, f);
  };
  for (const b of db.settlements) {
    if (!b.finalized || b.statementDay < from || b.statementDay > to || (who && !who.has(b.salesmanId))) continue;
    for (const l of b.lines) {
      if (chosen && !chosen.has(l.productId)) continue;
      const units = l.soldQuantity;
      if (!(units > 0)) continue;
      const amount = units * l.unitAmount;
      const commission = units * l.unitCommission;
      add(byProduct, l.productId, units, amount, commission);
      add(bySalesman, b.salesmanId, units, amount, commission);
      totals.units += units;
      totals.amount += amount;
      totals.commission += commission;
    }
  }
  const rank = (m: Map<string, SalesFigures>, name: (id: string) => string): ProductSalesRow[] =>
    [...m.entries()]
      .map(([id, f]) => ({ id, name: name(id), units: f.units, amount: cents(f.amount), commission: cents(f.commission) }))
      .sort((a, b) => b.units - a.units || b.amount - a.amount || a.name.localeCompare(b.name));
  return {
    totals: { units: totals.units, amount: cents(totals.amount), commission: cents(totals.commission) },
    products: rank(byProduct, (id) => productName.get(id) ?? id),
    salesmen: rank(bySalesman, (id) => salesmanName.get(id) ?? id),
  };
}

/** One product on one finalized daily bill, exactly as saved. */
export type HistoryRow = {
  key: string;
  date: string;
  salesman: string;
  product: string;
  /** Fillup (carried in from the previous confirmed Return) and Add More (stock given that day), as saved on the bill line. */
  fillup: number;
  addMore: number;
  /** Total holding = Fillup + Add More. */
  total: number;
  /** The confirmed Return. Sold = Total − Return; only Sold counts as sales (stock given is not a sale). */
  returned: number;
  sold: number;
  amount: number;
  commission: number;
};

export type DailyRow = { date: string; returned: number; sold: number; amount: number; commission: number };

/**
 * The saved finalized daily bills behind the analysis, line by line, newest day first (then salesman, then product): every line that held
 * stock or sold something, for the chosen salesmen and products in the period. Same inclusion rules as productSales, so the rows add up to it.
 * `daily` totals each date, and `totals` the whole period.
 */
export function salesHistory(db: Database, from: string, to: string, productIds: string[] | null, salesmanIds: string[] | null) {
  const chosen = productIds ? new Set(productIds) : null;
  const who = salesmanIds ? new Set(salesmanIds) : null;
  const productName = new Map(db.products.map((p) => [p.id, p.name]));
  const salesmanName = new Map(db.salesmen.map((x) => [x.id, x.name]));
  const rows: HistoryRow[] = [];
  for (const b of db.settlements) {
    if (!b.finalized || b.statementDay < from || b.statementDay > to || (who && !who.has(b.salesmanId))) continue;
    for (const l of b.lines) {
      if (chosen && !chosen.has(l.productId)) continue;
      if (!(l.totalAvailableQuantity > 0) && !(l.soldQuantity > 0)) continue;
      rows.push({
        key: `${b.id}|${l.productId}`,
        date: b.statementDay,
        salesman: salesmanName.get(b.salesmanId) ?? b.salesmanId,
        product: productName.get(l.productId) ?? l.productId,
        fillup: l.carriedOpeningQuantity,
        addMore: l.newFillupQuantity,
        total: l.totalAvailableQuantity,
        returned: l.returnQuantity,
        sold: l.soldQuantity,
        amount: cents(l.soldQuantity * l.unitAmount),
        commission: cents(l.soldQuantity * l.unitCommission),
      });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.salesman.localeCompare(b.salesman) || a.product.localeCompare(b.product));
  const byDay = new Map<string, DailyRow>();
  const totals = { returned: 0, sold: 0, amount: 0, commission: 0 };
  for (const r of rows) {
    const d = byDay.get(r.date) ?? { date: r.date, returned: 0, sold: 0, amount: 0, commission: 0 };
    d.returned += r.returned;
    d.sold += r.sold;
    d.amount = cents(d.amount + r.amount);
    d.commission = cents(d.commission + r.commission);
    byDay.set(r.date, d);
    totals.returned += r.returned;
    totals.sold += r.sold;
    totals.amount = cents(totals.amount + r.amount);
    totals.commission = cents(totals.commission + r.commission);
  }
  return { rows, daily: [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date)), totals };
}
