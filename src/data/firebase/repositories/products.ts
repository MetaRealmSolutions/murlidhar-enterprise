import { collection, doc, increment, onSnapshot, query, serverTimestamp, where, writeBatch, type WriteBatch } from 'firebase/firestore';

import type { Product } from '../../db/schema';
import { db } from '../firestore';

/** Stable product id from the name (same rule as scripts/seed-products.js). */
export function productIdFor(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Items that have no saved serial yet sort after those that do, by name. */
const UNORDERED = 1e9;

/** The owner reads every product; a salesman only the active ones (the security rules require it). */
export function subscribeProducts(ownerView: boolean, onData: (products: Product[]) => void, onError: (e: unknown) => void) {
  const source = ownerView ? collection(db, 'products') : query(collection(db, 'products'), where('active', '==', true));
  return onSnapshot(
    source,
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            return { id: d.id, name: String(x.name ?? ''), amount: Number(x.amount ?? 0), commission: Number(x.commission ?? 0), stock: Number(x.stock ?? 0), minimumStock: Number.isInteger(x.minimumStock) && x.minimumStock >= 0 ? x.minimumStock : 0, serial: typeof x.serial === 'number' ? x.serial : UNORDERED, active: x.active === true };
          })
          .sort((a, b) => a.serial - b.serial || a.name.localeCompare(b.name)),
      ),
    onError,
  );
}

export const newBatch = () => writeBatch(db);

/** Adds the product document to a batch. Opening stock is the product's own `stock` field. */
export function batchCreateProduct(batch: WriteBatch, id: string, input: { name: string; amount: number; commission: number; stock: number; minimumStock: number; serial: number }) {
  batch.set(doc(db, 'products', id), {
    name: input.name,
    amount: input.amount,
    commission: input.commission,
    stock: input.stock,
    minimumStock: input.minimumStock,
    serial: input.serial,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Moves the product's stock field atomically (`increment`, so two writers never overwrite each other). */
export function batchAdjustStock(batch: WriteBatch, productId: string, delta: number) {
  batch.update(doc(db, 'products', productId), { stock: increment(delta), updatedAt: serverTimestamp() });
}

/** Saves a new place in the Item Master order. */
export function batchSetSerial(batch: WriteBatch, id: string, serial: number) {
  batch.update(doc(db, 'products', id), { serial, updatedAt: serverTimestamp() });
}

export function batchUpdateProduct(batch: WriteBatch, id: string, input: { name: string; amount: number; commission: number; minimumStock?: number; active?: boolean; serial?: number }) {
  batch.update(doc(db, 'products', id), {
    name: input.name,
    amount: input.amount,
    commission: input.commission,
    ...(input.minimumStock === undefined ? {} : { minimumStock: input.minimumStock }),
    ...(input.active === undefined ? {} : { active: input.active }),
    ...(input.serial === undefined ? {} : { serial: input.serial }),
    updatedAt: serverTimestamp(),
  });
}
