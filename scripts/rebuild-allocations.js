// REBUILD / BACKFILL: sets allocations/{productId}.outstanding from the saved salesman bills.
//
// allocations/{productId}.outstanding is the number of units of a product that are WITH salesmen (given, not yet sold). The app keeps
// it up to date inside the same transactions that give stock, confirm a Return and correct a finalized bill, and refuses new stock
// given when it is more than  products/{id}.stock - outstanding.  A product with no counter yet starts from the figure the app derives
// from the saved bills, so running this is optional; use it to (re)build the counters from scratch, e.g. after data was restored or
// edited by hand.
//
// The figure per product is derived exactly as the app does it (src/data/derive.ts, outstandingByProduct): for each salesman, the
// Return of their latest FINALIZED daily bill, plus the stock given on every later bill that is not finalized yet.
//
// Only allocations/* is written. Bills, stock and receipts are never touched. Dry run by default (prints the differences).
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/rebuild-allocations.js
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/rebuild-allocations.js --apply
// Run it while nobody is giving stock or confirming Returns: a bill saved while it runs can make the figure out of date.

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "testing-f3b2c";
const APPLY = process.argv.includes("--apply");

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log(`Allocation rebuild (project: ${PROJECT_ID}) — ${APPLY ? "APPLYING" : "dry run, nothing is written"}\n`);
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) fail("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();

  const bills = (await db.collectionGroup("dailyBills").get()).docs.map((d) => ({ salesmanId: d.ref.parent.parent.id, day: d.id, ...d.data() }));
  const bySalesman = new Map();
  for (const b of bills) bySalesman.set(b.salesmanId, [...(bySalesman.get(b.salesmanId) ?? []), b]);

  const outstanding = {};
  for (const list of bySalesman.values()) {
    const sorted = list.sort((a, b) => a.day.localeCompare(b.day));
    const lastFinal = [...sorted].reverse().find((b) => b.finalized === true);
    for (const l of lastFinal?.lines ?? []) if (l.returnQuantity > 0) outstanding[l.productId] = (outstanding[l.productId] ?? 0) + l.returnQuantity;
    for (const b of sorted) {
      if (b.finalized === true || (lastFinal && b.day <= lastFinal.day)) continue;
      for (const l of b.lines ?? []) if (l.newFillupQuantity > 0) outstanding[l.productId] = (outstanding[l.productId] ?? 0) + l.newFillupQuantity;
    }
  }

  const products = await db.collection("products").get();
  const existing = new Map((await db.collection("allocations").get()).docs.map((d) => [d.id, d.data().outstanding]));
  let changes = 0;
  for (const p of products.docs) {
    const want = outstanding[p.id] ?? 0;
    const have = existing.get(p.id);
    const stock = Number(p.data().stock ?? 0);
    const note = want > stock ? `  ⚠ more than the warehouse stock (${stock}): check the bills` : "";
    if (have === want) continue;
    changes++;
    console.log(`• ${p.id}: outstanding ${have === undefined ? "(none)" : have} → ${want}${note}`);
    if (APPLY) await db.collection("allocations").doc(p.id).set({ outstanding: want, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  console.log(changes === 0 ? "\nEvery counter already matches the saved bills." : APPLY ? `\n${changes} counter(s) written.` : `\n${changes} counter(s) would change. Re-run with --apply to write.`);
}

main().catch((e) => fail(e.message));
