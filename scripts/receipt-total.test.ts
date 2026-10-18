// Offline tests for the stock receipt arithmetic (src/data/receipt-total.ts): the same functions the Add Stock screen shows and the save uses.
// Run: node scripts/run-opening-stock-tests.cjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatINR, lineTotal, lineTotalPaise, parsePrice, receiptTotal } from '../src/data/receipt-total';

test('manual purchase price: digits with at most two decimals, nothing else', () => {
  assert.equal(parsePrice('12'), 12);
  assert.equal(parsePrice('12.5'), 12.5);
  assert.equal(parsePrice('59.97'), 59.97);
  for (const bad of ['', '.', '1.234', 'abc', '-3', '1e3', '12.', ' 5']) assert.equal(parsePrice(bad), null, bad);
});

test('row total is purchase price x quantity, exact to the paisa', () => {
  assert.equal(lineTotal(100, 5), 500);
  assert.equal(lineTotal(19.99, 3), 59.97); // 19.99 * 3 is 59.970000000000006 in floating point
  assert.equal(lineTotal(0.1, 3), 0.3);
  assert.equal(lineTotalPaise(19.99, 3), 5997);
});

test('zero quantity gives a zero total', () => {
  assert.equal(lineTotal(250, 0), 0);
});

test('an invalid or missing price or quantity gives 0, never NaN', () => {
  for (const [price, qty] of [[null, 5], [Number.NaN, 5], [-1, 5], [10, -2], [10, 1.5], [10, Number.NaN], [Infinity, 2]] as [number | null, number][]) {
    const v = lineTotal(price, qty);
    assert.equal(v, 0, `${price} x ${qty}`);
    assert.ok(!Number.isNaN(v));
  }
});

test('the receipt total is exactly the sum of its row totals (several products, mixed prices and zero rows)', () => {
  const lines = [
    { price: 19.99, qty: 3 },
    { price: 100, qty: 0 },
    { price: 7.5, qty: 4 },
    { price: null, qty: 9 },
    { price: 0.01, qty: 1 },
  ];
  assert.equal(receiptTotal(lines), 59.97 + 0 + 30 + 0 + 0.01);
  assert.equal(receiptTotal(lines), Math.round(lines.reduce((n, l) => n + lineTotalPaise(l.price, l.qty), 0)) / 100);
});

test('receipt total equals the sum of row totals for many random receipts (no drift)', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 500; i++) {
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => ({ price: Math.round(rnd() * 100000) / 100, qty: Math.floor(rnd() * 500) }));
    const rows = lines.reduce((n, l) => n + lineTotalPaise(l.price, l.qty), 0);
    assert.equal(Math.round(receiptTotal(lines) * 100), rows);
  }
});

test('changing a price or a quantity changes only that row and the total, immediately', () => {
  const lines = [{ price: 10, qty: 2 }, { price: 5, qty: 4 }];
  assert.equal(receiptTotal(lines), 40);
  lines[0].qty = 3;
  assert.equal(lineTotal(lines[0].price, lines[0].qty), 30);
  assert.equal(lineTotal(lines[1].price, lines[1].qty), 20);
  assert.equal(receiptTotal(lines), 50);
  lines[1].price = 12.5;
  assert.equal(receiptTotal(lines), 80);
});

test('rupee display: Indian grouping, paise only when present', () => {
  assert.equal(formatINR(0), '₹0');
  assert.equal(formatINR(500), '₹500');
  assert.equal(formatINR(125000), '₹1,25,000');
  assert.equal(formatINR(59.97), '₹59.97');
  assert.equal(formatINR(1250.5), '₹1,250.50');
});
