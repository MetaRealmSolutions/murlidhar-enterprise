// ONE-TIME RECONCILE: applies sales and receipts recorded BEFORE products.stock became the real
// warehouse figure.
//
// Until now a SALE (or a later RECEIVE_STOCK) only wrote a ledger entry and the app subtracted /
// added it on screen, so Firestore's products/{id}.stock never moved. For every such entry
// (type SALE or RECEIVE_STOCK without `stockApplied`, "Opening stock" mirrors excluded) this script, in
// ONE Firestore transaction per entry:
//   1. re-reads the entry and skips it if it is already `stockApplied`,
//   2. changes products/{productId}.stock by -qty (SALE) or +qty (RECEIVE_STOCK),
//   3. marks the entry `stockApplied: true`.
// The flag makes it safe to run again: nothing is ever applied twice, and the app stops adding the
// entry on screen the moment it is flagged, so the displayed stock does not change.
//
// Dry run by default (prints what it would do). Pass --apply to write.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/reconcile-stock.js
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/reconcile-stock.js --apply

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "testing-f3b2c";
const APPLY = process.argv.includes("--apply");

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log(`Stock reconcile (project: ${PROJECT_ID}) — ${APPLY ? "APPLYING" : "dry run, nothing is written"}\n`);
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) fail("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();

  // Date-wise ledger: transactions/{yyyy-mm-dd}/entries/{id}
  const snap = await db.collectionGroup("entries").get();
  const pending = snap.docs
    .filter((d) => {
      const x = d.data();
      if (x.stockApplied === true) return false;
      if (x.type === "SALE") return true;
      return x.type === "RECEIVE_STOCK" && x.note !== "Opening stock";
    })
    .sort((a, b) => String(a.data().at).localeCompare(String(b.data().at)));

  if (pending.length === 0) {
    console.log("Nothing to reconcile: every sale and receipt is already applied to products.stock.");
    return;
  }

  let applied = 0;
  for (const d of pending) {
    const x = d.data();
    const delta = x.type === "SALE" ? -x.qty : x.qty;
    const productRef = db.doc(`products/${x.productId}`);
    if (!APPLY) {
      const p = await productRef.get();
      const now = p.exists ? p.data().stock : "(missing product)";
      console.log(`• ${d.id}  ${x.type} ${x.productId} qty ${x.qty}: stock ${now} → ${p.exists ? now + delta : "n/a"}`);
      continue;
    }
    const result = await db.runTransaction(async (t) => {
      const [tx, p] = await Promise.all([t.get(d.ref), t.get(productRef)]);
      if (tx.data().stockApplied === true) return "already applied";
      if (!p.exists) return "product missing";
      const next = Number(p.data().stock ?? 0) + delta;
      if (next < 0) return `would make stock negative (${next})`;
      t.update(productRef, { stock: next });
      t.update(d.ref, { stockApplied: true });
      return `stock → ${next}`;
    });
    if (result.startsWith("stock")) applied++;
    console.log(`${result.startsWith("stock") ? "✓" : "✗"} ${d.id}  ${x.type} ${x.productId} qty ${x.qty}: ${result}`);
  }
  console.log(APPLY ? `\n${applied} of ${pending.length} entries applied.` : `\n${pending.length} entries would be applied. Re-run with --apply.`);
}

main().catch((e) => fail(e.message));
