// Stock receipt money, pure (no Firebase, no UI), so the screen and the save use exactly the same arithmetic and it can be tested alone.
// Everything is done in whole paise (integers), so 19.99 × 3 is 59.97 and a receipt total is always exactly the sum of its row totals.

/** A typed purchase price: digits with at most two decimals. null for anything else (empty, "1.234", "abc"). */
export function parsePrice(text: string): number | null {
  return /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : null;
}

const paise = (rupees: number) => Math.round(rupees * 100);

/** One row's total in whole paise: purchase price × quantity. A missing or invalid price counts as 0, so the total never becomes NaN. */
export function lineTotalPaise(price: number | null, qty: number): number {
  if (price === null || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(qty) || qty < 0) return 0;
  return paise(price) * qty;
}

/** One row's total in rupees. */
export const lineTotal = (price: number | null, qty: number): number => lineTotalPaise(price, qty) / 100;

/** The receipt total in rupees: exactly the sum of its rows' totals. */
export const receiptTotal = (lines: { price: number | null; qty: number }[]): number => lines.reduce((n, l) => n + lineTotalPaise(l.price, l.qty), 0) / 100;

/** ₹ with Indian digit grouping; paise are shown only when there are some (₹1,25,000 or ₹59.97). */
export function formatINR(rupees: number): string {
  const total = Math.round(rupees * 100);
  const whole = Math.trunc(Math.abs(total) / 100);
  const frac = Math.abs(total) % 100;
  const s = String(whole);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${total < 0 ? '-' : ''}₹${grouped}${frac ? `.${String(frac).padStart(2, '0')}` : ''}`;
}
