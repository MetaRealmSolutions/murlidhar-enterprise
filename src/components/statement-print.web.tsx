import { Asset } from 'expo-asset';

import { BUSINESS_ADDRESS, BUSINESS_GSTIN, BUSINESS_PHONES, num, rupees } from '../mock/data';
import { getDatabase } from '../data/db/database';
import { formatLong, formatTime, generatedOn, localDate } from '../data/statements';
import type { PrivateBillPrintProps, StatementProps } from './statement-print';

/*
 * The print document is NOT part of the React tree. Rendering it as a portal made every mounted
 * copy of the screen (navigators can keep stale screens alive) append its own statement to <body>,
 * each stamped at its own render time. Instead, printing builds ONE document on demand:
 *   - a single #print-root container (any previous one is removed first),
 *   - filled once, with one "Generated on" timestamp,
 *   - printed once, then removed.
 */

const ROOT_ID = 'print-root';
const STYLE_ID = 'print-root-style';

const CSS = `
#${ROOT_ID} { display: none; }
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body > *:not(#${ROOT_ID}) { display: none !important; }
  #${ROOT_ID} {
    display: block;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
  }
  #${ROOT_ID} h1 { font-size: 20pt; margin: 0; text-align: center; letter-spacing: 1px; }
  #${ROOT_ID} h2 { font-size: 13pt; margin: 4px 0 14px; text-align: center; font-weight: 600; letter-spacing: 2px; }
  #${ROOT_ID} .meta { display: flex; justify-content: space-between; margin-bottom: 16px; line-height: 1.6; }
  #${ROOT_ID} .day { margin-bottom: 16px; page-break-inside: avoid; }
  #${ROOT_ID} .day-title { font-weight: 700; font-size: 11.5pt; padding-bottom: 4px; border-bottom: 2px solid #000; margin-bottom: 6px; }
  #${ROOT_ID} .day-info { font-weight: 400; font-size: 9.5pt; }
  #${ROOT_ID} table { width: 100%; border-collapse: collapse; }
  #${ROOT_ID} th, #${ROOT_ID} td { border: 1px solid #000; padding: 4px 5px; font-size: 9pt; }
  #${ROOT_ID} th { font-weight: 700; text-align: left; }
  #${ROOT_ID} .r { text-align: right; }
  #${ROOT_ID} tr { page-break-inside: avoid; }
  #${ROOT_ID} thead { display: table-header-group; }
  #${ROOT_ID} tfoot td { font-weight: 700; }
  #${ROOT_ID} .grand { margin-top: 18px; page-break-inside: avoid; }
  #${ROOT_ID} .grand-title { font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; }
  #${ROOT_ID} .grand table { width: 60%; margin-left: auto; }
  #${ROOT_ID} .grand td { font-weight: 700; font-size: 10.5pt; }
  #${ROOT_ID} .empty { padding: 20px 0; text-align: center; }
  #${ROOT_ID} .footer { margin-top: 26px; font-size: 8.5pt; border-top: 1px solid #000; padding-top: 6px; }
}
`;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DAILY_HEAD = ['Cmsn', 'Product', 'Fl. Prd.', 'Rtn. Prd.', 'Sl. Prd.', 'Amount'];

/** The daily print is A4 portrait (210 × 297 mm) with two compact tables side by side, so it has its own page size and styles. */
const DAILY_CSS = `
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  #${ROOT_ID} { font-size: 8pt; }
  #${ROOT_ID} h2 { font-size: 10pt; margin: 2px 0 6px; letter-spacing: 2px; }
  #${ROOT_ID} .biz { text-align: center; margin-bottom: 8px; background: #fff; color: #000; }
  #${ROOT_ID} .biz h1 { font-size: 26px; line-height: 1.2; text-decoration: underline; letter-spacing: 0; white-space: nowrap; }
  #${ROOT_ID} .biz-sub { display: flex; align-items: center; justify-content: center; width: 100%; box-sizing: border-box; margin: 4px 0 0; padding: 6px 8px; background: #000000; color: #fff; font-size: 16px; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #${ROOT_ID} .biz-addr { font-size: 16px; margin-top: 2px; white-space: nowrap; }
  #${ROOT_ID} .bill-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; margin-bottom: 8px; font-size: 11pt; }
  #${ROOT_ID} .meta { margin-bottom: 6px; line-height: 1.3; font-size: 9pt; }
  #${ROOT_ID} table.list { table-layout: fixed; }
  #${ROOT_ID} table.list th.gap, #${ROOT_ID} table.list td.gap { border: 0; padding: 0; }
  #${ROOT_ID} th, #${ROOT_ID} td { padding: 2px 3px; font-size: 7.5pt; line-height: 1.2; word-wrap: break-word; overflow-wrap: anywhere; }
  #${ROOT_ID} th { text-align: center; white-space: normal; font-size: 7pt; }
  #${ROOT_ID} td.r { white-space: nowrap; }
  #${ROOT_ID} td.c { text-align: center; }
  #${ROOT_ID} .overall { margin-top: 6px; page-break-inside: avoid; break-inside: avoid; }
  #${ROOT_ID} .overall { display: flex; justify-content: space-between; align-items: baseline; gap: 12mm; font-size: 10pt; white-space: nowrap; border-top: 1px solid #000; padding-top: 4px; }
  #${ROOT_ID} .footer { margin-top: 6px; padding-top: 3px; font-size: 7pt; }
}
`;

/**
 * One date's finalized bill on a single A4 portrait page: EVERY Item Master product, in Item Master order, split
 * across two side-by-side tables. A product with no activity that day prints zeros. Each product counts once.
 */
function dailyHtml({ salesmanName, phone, statement }: StatementProps, generated: string) {
  const day = statement.days[0];
  const lines = new Map((day?.lines ?? []).map((l) => [l.product, l]));
  const zero = { fillup: 0, total: 0, returned: 0, sold: 0, totalAmount: 0, totalCommission: 0 };
  const rows = getDatabase().products.filter((p) => p.active).map((p) => ({ name: p.name, v: lines.get(p.name) ?? zero, hit: lines.delete(p.name) }));
  // A bill line whose product is no longer in the active Item Master (deactivated) still prints, after the rest.
  for (const [name, v] of lines) rows.push({ name, v, hit: true });

  // Item Master order runs on across both halves (the right half starts where the left one ends); the left half gets the odd product.
  // ONE table whose every row holds a left product and a right product: the two halves stay side by side and aligned, the header row repeats
  // on each printed page, and the page breaks fall between rows, so a long list simply continues on the next page.
  const half = Math.ceil(rows.length / 2);
  const left = rows.slice(0, half);
  const right = rows.slice(half);
  const pct = (w: number[]) => w.map((x) => `<col style="width:${x}%">`).join('');
  // Product takes the most room; the three quantities (up to 4 digits) the least; the two money columns a little more. A thin gap between the halves.
  const W = [7.35, 16.17, 4.9, 4.9, 4.9, 10.78];
  const cols = `<colgroup>${pct(W)}<col style="width:2%">${pct(W)}</colgroup>`;
  const th = DAILY_HEAD.map((h, i) => `<th${i === 1 ? ' style="text-align:left"' : ''}>${h}</th>`).join('');
  const head = `${cols}<thead><tr>${th}<th class="gap"></th>${th}</tr></thead>`;
  const cells = (r?: (typeof rows)[number]) =>
    r
      ? `<td class="r">${rupees(r.v.totalCommission)}</td><td>${esc(r.name)}</td><td class="r">${num(r.v.fillup)}</td><td class="r">${num(r.v.returned)}</td><td class="r">${num(r.v.sold)}</td><td class="r">${rupees(r.v.totalAmount)}</td>`
      : '<td></td><td></td><td></td><td></td><td></td><td></td>';
  const body = left.map((l, i) => `<tr>${cells(l)}<td class="gap"></td>${cells(right[i])}</tr>`).join('');
  // Each product is in `rows` once, so the two totals cover the whole statement, not just what one page shows.
  const sum = (pick: (v: typeof zero) => number) => rows.reduce((x, r) => x + pick(r.v), 0);
  // Printed once, after the last product row; kept together on one page.
  const overall =
    `<div class="overall">` +
    `<div>Commission Total: <b>${rupees(sum((v) => v.totalCommission))}</b></div>` +
    `<div>Amount Total: <b>${rupees(sum((v) => v.totalAmount))}</b></div>` +
    `</div>`;
  return (
    `<div class="biz"><h1>SHREE MURLIDHAR ENTERPRISE</h1><div class="biz-sub">Tanish Home Care &amp; Personal Care</div>` +
    `<div class="biz-addr">Koday Pool, Bhuj-Mandvi Highway, Mandvi(Kutch), M. 9909271340</div></div>` +
    `<div class="bill-meta"><div>Bill No: ${esc(day?.billNo ?? '______')}</div><div>Salesman: ${esc(salesmanName)}</div>` +
    `<div>Date: ${formatLong(statement.from)}</div><div>Village: ${esc(day?.village ?? '______')}</div></div>` +
    `<table class="list">${head}<tbody>${body}</tbody></table>` +
    overall +
    `<div class="footer">Generated on: ${generated}</div>`
  );
}

const BILL_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  #${ROOT_ID} { font-size: 10pt; }
  /* Three-column grid (1fr auto 1fr): the middle logo is centred on the page whatever the side content widths. */
  #${ROOT_ID} .hrow { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; column-gap: 4mm; }
  #${ROOT_ID} .hrow .l { justify-self: stretch; text-align: left; display: flex; flex-direction: column; }
  #${ROOT_ID} .hrow .c { justify-self: center; }
  #${ROOT_ID} .hrow .r { justify-self: end; text-align: right; }
  #${ROOT_ID} .hrow .l, #${ROOT_ID} .hrow .r { align-self: start; min-width: 0; }
  #${ROOT_ID} .hrow img { display: block; object-fit: contain; width: auto; }
  #${ROOT_ID} .hrow .big { height: 28mm; }
  #${ROOT_ID} .hrow .tanish { height: 16mm; max-width: 100%; margin-top: 2mm; align-self: flex-end; }
  #${ROOT_ID} .hrow .info { font-size: 10pt; font-weight: 700; line-height: 1.4; }
  #${ROOT_ID} .hrow .phone { display: inline-flex; align-items: flex-start; text-align: left; white-space: nowrap; }
  #${ROOT_ID} .hrow .phone .nums { line-height: 1.4; }
  #${ROOT_ID} .hrow .ph { display: inline-block; width: 3.4mm; height: 3.4mm; margin: 0.7mm 1mm 0 0; flex: none; }
  #${ROOT_ID} .addr-box { margin-top: 3mm; border: 1px solid #000; padding: 2px 6px; text-align: center; font-size: 10pt; overflow-wrap: anywhere; }
  #${ROOT_ID} .bill-meta { display: grid; grid-template-columns: 70% 30%; margin: 3mm 0 12px; border: 1px solid #000; font-size: 10.5pt; }
  #${ROOT_ID} .bill-meta .col + .col { border-left: 1px solid #000; }
  #${ROOT_ID} .bill-meta .fld { display: flex; gap: 6px; min-height: 1.3em; padding: 4px 6px; }
  #${ROOT_ID} .bill-meta .fld + .fld { border-top: 1px solid #000; }
  #${ROOT_ID} .bill-meta .lbl { flex: 0 0 16mm; font-weight: 700; }
  #${ROOT_ID} .bill-meta .col + .col .lbl { flex-basis: 15mm; }
  #${ROOT_ID} .bill-meta .val { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  #${ROOT_ID} table.items th, #${ROOT_ID} table.items td { padding: 6px 6px; font-size: 10pt; vertical-align: top; overflow-wrap: anywhere; }
  #${ROOT_ID} table.items { table-layout: fixed; }
  #${ROOT_ID} td.c, #${ROOT_ID} th.c { text-align: center; }
  #${ROOT_ID} th.r { text-align: right; }
}
`;

/** Bill header, customer/bill details, items table. Saved values only; nothing is recomputed from the Item Master. */
function billHtml({ bill }: PrivateBillPrintProps) {
  const units = bill.lines.reduce((s, l) => s + l.qty, 0);
  const rows = bill.lines
    .map((l, i) => `<tr><td class="c">${i + 1}</td><td>${esc(l.name)}</td><td class="r">${num(l.qty)}</td><td class="r">${rupees(l.rate)}</td><td class="r">${rupees(l.total)}</td></tr>`)
    .join('');
  const cols = '<colgroup><col style="width:10%"><col style="width:42%"><col style="width:12%"><col style="width:16%"><col style="width:20%"></colgroup>';
  const murlidhar = esc(Asset.fromModule(require('../../assets/murlidharenterpriselogo-removebg-preview.png')).uri);
  const tanish = esc(Asset.fromModule(require('../../assets/tanish.png')).uri);
  const field = (label: string, value: string) => `<div class="fld"><span class="lbl">${label}</span><span class="val">${esc(value)}</span></div>`;
  const gstin = `<div class="info">GSTIN: ${BUSINESS_GSTIN}</div>`;
  const phone =
    '<div class="info phone"><svg class="ph" viewBox="0 0 24 24" fill="#000" aria-hidden="true"><path d="M7 1h10a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2zm0 3v14h10V4H7zm5 15.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/></svg>' +
    `<div class="nums"><div>${BUSINESS_PHONES.slice(0, 2).join(', ')}</div><div>${BUSINESS_PHONES.slice(2).join(', ')}</div></div></div>`;
  return (
    `<div class="hrow"><div class="l">${gstin}<img class="tanish" src="${tanish}" alt=""></div><div class="c"><img class="big" src="${murlidhar}" alt=""></div><div class="r">${phone}</div></div>` +
    `<div class="addr-box"><b>Address:</b> ${BUSINESS_ADDRESS}</div>` +
    `<div class="bill-meta"><div class="col">${field('Name:', bill.customerName)}${field('Add:', '')}</div>` +
    `<div class="col">${field('Bill No:', bill.id)}${field('Date:', formatLong(localDate(bill.at)))}</div></div>` +
    `<table class="items">${cols}<thead><tr><th class="c">Sr. No.</th><th>Product</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>` +
    `<tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total</td><td class="r">${num(units)}</td><td></td><td class="r">${rupees(bill.total)}</td></tr></tfoot></table>`
  );
}

function removePrintDocument() {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
}

function printDocument(css: string, html: string) {
  removePrintDocument(); // never leave a copy from a previous print

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = html;
  document.head.appendChild(style);
  document.body.appendChild(root);

  window.addEventListener('afterprint', removePrintDocument, { once: true });
  // Print only once any image (the bill logo) has loaded, so it is never missing from the page.
  const pending = Array.from(root.querySelectorAll('img')).filter((img) => !img.complete);
  const done = Promise.race([
    Promise.all(pending.map((img) => new Promise((r) => { img.onload = img.onerror = () => r(null); }))),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  done.then(() => window.print());
}

/** Builds the single print document, prints it once, and removes it afterwards. */
export function printStatement(props: StatementProps) {
  printDocument(CSS + DAILY_CSS, dailyHtml(props, generatedOn())); // timestamp taken once, here
}

/** Prints one saved Private Bill on A4 from its stored data. */
export function printPrivateBill(props: PrivateBillPrintProps) {
  printDocument(CSS + BILL_CSS, billHtml(props));
}
