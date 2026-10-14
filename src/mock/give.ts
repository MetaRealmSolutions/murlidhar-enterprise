// Pure quantity logic for the Add Stock sheet (no UI, never touches stock).
import { getProducts } from '../data/repository';

/** Pending give quantity per product id, as text so the field can be edited freely. */
export type Quantities = Record<string, string>;

const MAX_DIGITS = 7;

/** Typed text → clean non-negative integer text. Empty stays empty; "007" becomes "7". */
export function sanitizeQty(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, MAX_DIGITS);
  return d === '' ? '' : String(Number(d));
}

export const qtyOf = (q: Quantities, id: string): number => (/^\d+$/.test(q[id] ?? '') ? Number(q[id]) : 0);

/** + / −, never below 0 and never above the available warehouse stock. */
export function stepQty(q: Quantities, id: string, delta: number, available: number): { q: Quantities; capped: boolean } {
  const want = qtyOf(q, id) + delta;
  const next = Math.min(available, Math.max(0, want));
  return { q: { ...q, [id]: String(next) }, capped: want > available };
}

/** Typed quantity; anything above the available stock is clamped to it and reported as capped. */
export function typeQty(q: Quantities, id: string, text: string, available: number): { q: Quantities; capped: boolean } {
  const clean = sanitizeQty(text);
  if (clean === '') return { q: { ...q, [id]: '' }, capped: false };
  const n = Number(clean);
  return n > available ? { q: { ...q, [id]: String(available) }, capped: true } : { q: { ...q, [id]: clean }, capped: false };
}

/** Products with a quantity above zero, in catalogue order: the pending transfer. */
export function pendingLines(q: Quantities): { id: string; qty: number }[] {
  return getProducts().filter((p) => qtyOf(q, p.id) > 0).map((p) => ({ id: p.id, qty: qtyOf(q, p.id) }));
}

export function totals(q: Quantities) {
  const lines = pendingLines(q);
  return { products: lines.length, units: lines.reduce((n, l) => n + l.qty, 0) };
}

/** Pending lines that ask for more than the warehouse currently holds (e.g. stock changed meanwhile). */
export function overLimit(q: Quantities, stocks: Record<string, number>) {
  return pendingLines(q).filter((l) => l.qty > (stocks[l.id] ?? 0));
}
