// The one stock-status rule for the whole app. Each product has its own Minimum Stock (Item Master); a product saved before the field
// existed has none and is read as 0.
export type StockStatus = 'healthy' | 'low' | 'out';

/**
 * Out of stock: stock is 0. Low stock: above 0 and at or below the product's Minimum Stock. Healthy: above its Minimum Stock.
 * (Stock 5 / minimum 10 is low, 10 / 10 is low, 11 / 10 is healthy, 5 / 0 is healthy.)
 */
export function getStockStatus(stock: number, minimumStock = 0): StockStatus {
  if (stock <= 0) return 'out';
  if (stock <= minimumStock) return 'low';
  return 'healthy';
}

/** The status of a product (anything with `stock` and, optionally, `minimumStock`). */
export const productStatus = (p: { stock: number; minimumStock?: number }): StockStatus => getStockStatus(p.stock, p.minimumStock ?? 0);

export const STATUS_LABEL: Record<StockStatus, string> = {
  healthy: 'Healthy',
  low: 'Low Stock',
  out: 'Out of Stock',
};

/** Severity order used when sorting by status (healthy first). */
export const STATUS_RANK: Record<StockStatus, number> = { healthy: 0, low: 1, out: 2 };
