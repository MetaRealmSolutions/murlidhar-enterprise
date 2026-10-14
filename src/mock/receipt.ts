// Pure quantity-sheet logic for Receive Stock (no UI, never touches stock).
import { getProducts, type Product } from '../data/repository';

/** Pending receive quantity per product id, kept as text so the field can be edited freely. */
export type Quantities = Record<string, string>;

const MAX_DIGITS = 7;

/** Every word typed must appear in the product name. Empty search returns the whole catalogue. */
export function filterCatalogue(query: string, catalogue: Product[] = getProducts()): Product[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return catalogue;
  return catalogue.filter((p) => {
    const n = p.name.toLowerCase();
    return words.every((w) => n.includes(w));
  });
}

/** Typed text → clean non-negative integer text. Empty stays empty; "007" becomes "7". */
export function sanitizeQty(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, MAX_DIGITS);
  return d === '' ? '' : String(Number(d));
}

/** Numeric value of a stored quantity; empty or invalid counts as 0. */
export const qtyOf = (q: Quantities, id: string): number => (/^\d+$/.test(q[id] ?? '') ? Number(q[id]) : 0);

/** + / − by delta, never below 0 (or above the digit cap). */
export function stepQty(q: Quantities, id: string, delta: number): Quantities {
  const next = Math.min(10 ** MAX_DIGITS - 1, Math.max(0, qtyOf(q, id) + delta));
  return { ...q, [id]: String(next) };
}

export function setQty(q: Quantities, id: string, text: string): Quantities {
  return { ...q, [id]: sanitizeQty(text) };
}

/** Products with a quantity above zero, in catalogue order: the pending receiving session. */
export function pendingLines(q: Quantities): { id: string; qty: number }[] {
  return getProducts().filter((p) => qtyOf(q, p.id) > 0).map((p) => ({ id: p.id, qty: qtyOf(q, p.id) }));
}

export function totals(q: Quantities) {
  const lines = pendingLines(q);
  return { products: lines.length, units: lines.reduce((n, l) => n + l.qty, 0) };
}
