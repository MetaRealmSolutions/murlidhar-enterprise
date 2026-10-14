git push// Offline tests for the Opening Stock rules (src/data/opening-stock.ts). No Firestore: a small in-memory store stands in for the
// products collection and applies the same plan the real transaction applies. The product's history (receipts, bills, allocations) is
// kept next to it so the tests can show that saving a count neither reads it, nor changes it, nor is blocked by it. `reopen` models closing
// the app and coming back: the store is the only thing that survives. Run: node scripts/run-opening-stock-tests.cjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { focusAfterSave, openingRowView, planOpeningStock, runInitialization, type OpeningRequest } from '../src/data/opening-stock';

type Doc = { stock: number; openingStock?: number; openingStockSubmission?: string; openingStockPrevious?: number };
type History = { receipts: number[]; privateBills: number[]; salesmanBills: number[]; allocated: number };
type Store = { products: Record<string, Doc>; history: Record<string, History>; failNext: Set<string>; lostAck: Set<string>; writes: number };

const store = (): Store => ({ products: {}, history: {}, failNext: new Set(), lostAck: new Set(), writes: 0 });
const history = (h: Partial<History> = {}): History => ({ receipts: [], privateBills: [], salesmanBills: [], allocated: 0, ...h });

/** Mirrors initializeOpeningStockTransaction: read the product, plan, write `stock` as the new balance plus the metadata. */
async function transact(s: Store, id: string, req: OpeningRequest): Promise<void> {
  if (s.failNext.delete(id)) throw new Error('network');
  const doc = s.products[id];
  const plan = planOpeningStock(doc, req);
  if (!plan.ok) throw new Error(plan.error);
  if (plan.noop) return;
  s.writes++;
  doc.stock = plan.counted; // replaces: never an increment of the old balance
  doc.openingStock = plan.counted;
  doc.openingStockPrevious = plan.previousStock;
  doc.openingStockSubmission = req.submissionId;
  if (s.lostAck.delete(id)) throw new Error('network (commit happened, acknowledgement lost)');
}

const req = (counted: number, submissionId = 's1'): OpeningRequest => ({ counted, submissionId });

// ── The saved count is the stock ─────────────────────────────────────────────────────────────────
test('existing stock 50, physical count 100: stock becomes 100, not 150', async () => {
  const s = store();
  s.products.a = { stock: 50 };
  await transact(s, 'a', req(100));
  assert.equal(s.products.a.stock, 100);
  assert.equal(s.products.a.openingStockPrevious, 50);
});

test('a count lower than the existing stock replaces it too', async () => {
  const s = store();
  s.products.a = { stock: 80 };
  await transact(s, 'a', req(30));
  assert.equal(s.products.a.stock, 30);
});

test('existing receipts, private bills and salesman bills do not block or change the count', async () => {
  const s = store();
  s.products.a = { stock: 37 }; // what receipts, bills and sales left behind
  s.history.a = history({ receipts: [50, 20], privateBills: [8], salesmanBills: [25] });
  const before = JSON.stringify(s.history.a);
  await transact(s, 'a', req(100));
  assert.equal(s.products.a.stock, 100); // exactly the count: nothing added, nothing subtracted
  assert.equal(JSON.stringify(s.history.a), before); // history untouched
});

test('units allocated to salesmen do not block it and are not subtracted from the count', async () => {
  const s = store();
  s.products.a = { stock: 60 };
  s.history.a = history({ allocated: 25 });
  await transact(s, 'a', req(100));
  assert.equal(s.products.a.stock, 100); // not 75
  assert.equal(s.history.a.allocated, 25); // the allocation counter is left exactly as it was
});

test('editing a saved quantity: the new count is the stock, not a difference or an addition', async () => {
  const s = store();
  s.products.a = { stock: 0 };
  await transact(s, 'a', req(100, 'one'));
  await transact(s, 'a', req(120, 'two'));
  assert.equal(s.products.a.stock, 120);
  s.products.a.stock = 90; // a sale took 30 since
  await transact(s, 'a', req(110, 'three'));
  assert.equal(s.products.a.stock, 110); // the recount replaces the balance
  assert.equal(s.products.a.openingStock, 110);
});

// ── Default zero, explicit zero ──────────────────────────────────────────────────────────────────
test('default zero: an untouched product shows 0, is not pending, and nothing is written or changed', () => {
  const s = store();
  s.products.a = { stock: 7 };
  const v = openingRowView(s.products.a, undefined);
  assert.equal(v.value, '0');
  assert.equal(v.pending, false);
  assert.equal(v.saved, false);
  assert.equal(s.writes, 0);
  assert.equal(s.products.a.stock, 7);
});

test('an explicit 0 is pending, saves as stock 0 even over existing stock, and is then a saved value (not pending, not "untouched")', async () => {
  const s = store();
  s.products.a = { stock: 12 };
  s.history.a = history({ receipts: [12], allocated: 3 });
  assert.equal(openingRowView(s.products.a, '0').pending, true);
  await transact(s, 'a', req(0));
  assert.equal(s.products.a.stock, 0);
  assert.equal(s.products.a.openingStock, 0);
  const v = openingRowView(s.products.a, undefined);
  assert.equal(v.value, '0');
  assert.equal(v.saved, true); // distinguished from an untouched product
  assert.equal(v.pending, false);
});

test('an explicit 0 on a product whose stock is already 0 is still recorded', async () => {
  const s = store();
  s.products.a = { stock: 0 };
  await transact(s, 'a', req(0));
  assert.equal(s.products.a.openingStock, 0);
  assert.equal(s.writes, 1);
});

test('a change from a saved quantity to 0 is pending; the same quantity or a cleared box is not', () => {
  assert.equal(openingRowView({ openingStock: 25 }, '0').pending, true);
  assert.equal(openingRowView({ openingStock: 25 }, '25').pending, false);
  assert.equal(openingRowView({ openingStock: 25 }, '').pending, false);
});

test('invalid drafts are flagged and refused', () => {
  assert.equal(openingRowView({}, '1e3').valid, false);
  assert.equal(openingRowView({}, '99999999999999999999').valid, false);
  for (const bad of [-1, 1.5, Number.NaN, 1e300]) assert.equal(planOpeningStock({ stock: 1 }, req(bad)).ok, false);
});

// ── Gradual completion ───────────────────────────────────────────────────────────────────────────
test('save one product, close the app, resume later: saved quantities come back, untouched products stay untouched', async () => {
  const s = store();
  for (const id of ['a', 'b', 'c']) s.products[id] = { stock: 0 };
  await transact(s, 'a', req(30, 'day1-a'));
  const day2 = Object.entries(s.products).map(([id, p]) => [id, openingRowView(p, undefined)] as const);
  assert.deepEqual(day2.map(([id, v]) => [id, v.value, v.saved]), [['a', '30', true], ['b', '0', false], ['c', '0', false]]);
  await transact(s, 'b', req(5, 'day2-b'));
  assert.deepEqual([s.products.a.stock, s.products.b.stock, s.products.c.stock], [30, 5, 0]);
  assert.equal(s.products.c.openingStock, undefined);
});

test('saving several products together, independently: partial failures are reported exactly', async () => {
  const s = store();
  for (const id of ['a', 'b', 'c', 'd']) s.products[id] = { stock: 4 };
  s.history.b = history({ receipts: [4], allocated: 2 }); // history does not stop b
  s.failNext.add('c'); // network error on c only
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, counted: 10, submissionId: `s-${id}` }));
  const results = await runInitialization(items, (i) => transact(s, i.id, { counted: i.counted, submissionId: i.submissionId }), (e) => (e as Error).message);
  assert.deepEqual([results.a.ok, results.b.ok, results.c.ok, results.d.ok], [true, true, false, true]);
  assert.deepEqual([s.products.a.stock, s.products.b.stock, s.products.c.stock, s.products.d.stock], [10, 10, 4, 10]);
});

test('Save All processes only pending rows: untouched defaults are not initialized; an intentional zero is', () => {
  const rows = [
    { id: 'a', p: { openingStock: undefined }, draft: '5' },
    { id: 'b', p: { openingStock: undefined }, draft: undefined },
    { id: 'c', p: { openingStock: 10 }, draft: '10' },
    { id: 'd', p: { openingStock: 10 }, draft: '0' },
    { id: 'e', p: { openingStock: undefined }, draft: '0' },
  ];
  assert.deepEqual(rows.filter((r) => openingRowView(r.p, r.draft).pending).map((r) => r.id), ['a', 'd', 'e']);
});

// ── Repeated saves and retries ───────────────────────────────────────────────────────────────────
test('repeated saves of the same submission, or of the same count, write once', async () => {
  const s = store();
  s.products.a = { stock: 10 };
  await transact(s, 'a', req(25, 'x'));
  await transact(s, 'a', req(25, 'x'));
  await transact(s, 'a', req(25, 'another-id'));
  assert.equal(s.products.a.stock, 25);
  assert.equal(s.writes, 1);
});

test('a repeated save never compounds: 100, 100, 100 stays 100', async () => {
  const s = store();
  s.products.a = { stock: 50 };
  for (const id of ['1', '2', '3']) await transact(s, 'a', req(100, id));
  assert.equal(s.products.a.stock, 100);
});

test('network failure then retry with the same id: applied once, and the typed value survives the failure', async () => {
  const s = store();
  s.products.a = { stock: 3 };
  s.failNext.add('a');
  await assert.rejects(transact(s, 'a', req(20, 'r')), /network/);
  assert.equal(s.products.a.stock, 3);
  assert.equal(openingRowView(s.products.a, '20').pending, true);
  await transact(s, 'a', req(20, 'r'));
  assert.equal(s.products.a.stock, 20);
});

test('lost acknowledgement (the commit happened): the retry is a no-op', async () => {
  const s = store();
  s.products.a = { stock: 3 };
  s.lostAck.add('a');
  await assert.rejects(transact(s, 'a', req(20, 'r')), /acknowledgement lost/);
  assert.equal(s.products.a.stock, 20);
  await transact(s, 'a', req(20, 'r'));
  assert.equal(s.products.a.stock, 20);
  assert.equal(s.writes, 1);
});

// ── Enter-to-next (focus only) ───────────────────────────────────────────────────────────────────
test('Enter moves to the next input in the list order and skips rows with no input', () => {
  const order = ['a', 'b', 'c', 'd'];
  assert.equal(focusAfterSave(order, 'a', true, () => true), 'b');
  assert.equal(focusAfterSave(order, 'a', true, (id) => id !== 'b'), 'c');
});

test('Enter on the last input stays put', () => {
  assert.equal(focusAfterSave(['a', 'b'], 'b', true, () => true), null);
});

test('the next input follows the current filter and sort, found by product id', () => {
  assert.equal(focusAfterSave(['a', 'b', 'c', 'd'], 'a', true, () => true), 'b');
  assert.equal(focusAfterSave(['d', 'b', 'a', 'c'], 'a', true, () => true), 'c');
  assert.equal(focusAfterSave(['c', 'a'], 'c', true, () => true), 'a');
});
