// Opening Stock: the pure rules. No Firebase here, so they can be tested on their own (scripts/opening-stock.test.ts) and the
// Firestore transaction only applies what these functions decide.
//
// The quantity the owner enters and explicitly saves IS the product's main warehouse stock: `stock := counted`. It replaces the balance;
// it is never added to it, never reduced by anything, and nothing about the product's history (receipts, bills, returns, allocations)
// blocks it or changes the number. History is not touched: it stays exactly as it was.
//
// `products.stock` is the ONLY inventory balance. `openingStock` is metadata (the last saved count, so the screen can tell an untouched
// default 0 from a saved 0); it is never read as a balance anywhere.

export type OpeningDoc = {
  stock?: unknown;
  openingStock?: unknown;
  openingStockSubmission?: unknown;
};

export type OpeningRequest = {
  counted: number;
  /** Identifies one save: a retry of the same one is a no-op. */
  submissionId: string;
};

export type OpeningPlan =
  | { ok: false; error: string }
  /** Already applied by this very submission (a retry after a lost acknowledgement), or this count is already the stock and already recorded: nothing to write. */
  | { ok: true; noop: true }
  | { ok: true; noop: false; previousStock: number; counted: number };

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const isConfirmed = (d: OpeningDoc) => Number.isInteger(d.openingStock);

/** Decides one save from the product document the transaction just read. */
export function planOpeningStock(product: OpeningDoc | undefined, req: OpeningRequest): OpeningPlan {
  if (!product) return { ok: false, error: 'This product no longer exists.' };
  if (!isCount(req.counted)) return { ok: false, error: 'Enter a whole number of 0 or more.' };
  const confirmed = isConfirmed(product);
  if (confirmed && product.openingStockSubmission === req.submissionId) return { ok: true, noop: true };
  const stock = Number(product.stock ?? 0);
  // An unrecorded product is always written, even when the count equals its stock or is 0, so an intentional 0 is saved.
  if (confirmed && stock === req.counted && Number(product.openingStock) === req.counted) return { ok: true, noop: true };
  return { ok: true, noop: false, previousStock: stock, counted: req.counted };
}

/** What one Opening Stock row shows and whether it holds an unsaved edit. A product with no saved count shows 0 but is NOT pending until the owner types. */
export function openingRowView(product: { openingStock?: number }, draft: string | undefined) {
  const saved = product.openingStock !== undefined;
  const typed = draft !== undefined && draft !== '';
  const valid = typed && /^[0-9]+$/.test(draft) && Number.isSafeInteger(Number(draft));
  return {
    value: draft ?? (saved ? String(product.openingStock) : '0'),
    saved,
    // Pending: something was typed and it is not already the saved count. Typing 0 on an unsaved product is an intentional zero, so it is pending.
    pending: typed && (!saved || draft !== String(product.openingStock)),
    valid,
  };
}

/**
 * After Enter on a row: the id to focus next, or null. Only a successful save moves on (a failure keeps the focus and the typed value).
 * `order` is the rows as currently listed (filtered and sorted), by product id, so it never depends on a fixed row index; rows without an
 * input (blocked products) are skipped, and the last row stays put.
 */
export function focusAfterSave(order: string[], currentId: string, saved: boolean, canFocus: (id: string) => boolean): string | null {
  if (!saved) return null;
  for (const id of order.slice(order.indexOf(currentId) + 1)) if (canFocus(id)) return id;
  return null;
}

export type InitResult = { ok: true } | { ok: false; error: string };

/**
 * Applies a list of products one by one through `apply` (one awaited transaction each). A failure stops only its own product:
 * the others still run and every product gets its own result, so a partial success is reported exactly.
 */
export async function runInitialization<T extends { id: string }>(items: T[], apply: (item: T) => Promise<void>, describe: (e: unknown) => string): Promise<Record<string, InitResult>> {
  const out: Record<string, InitResult> = {};
  for (const item of items) {
    try {
      await apply(item);
      out[item.id] = { ok: true };
    } catch (e) {
      out[item.id] = { ok: false, error: describe(e) };
    }
  }
  return out;
}

/**
 * Metadata written with every save: the saved count, who and when, the balance
 * it replaced, and the id that makes a retry harmless.
 */
export const openingFields = (count: number, previous: number, at: string, by: string, submission: string) => ({
  openingStock: count,
  openingStockPrevious: previous,
  openingStockAt: at,
  openingStockBy: by,
  openingStockSubmission: submission,
});
