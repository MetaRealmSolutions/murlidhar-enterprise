// ONE-TIME DEV SCRIPT: seeds the TEST ledger the app needs to run on Firestore.
//   1. salesmen/{salesmanId}        for raj_001 and amit_001 (the salesmanId values in users/{uid})
//   2. transactions/seed-{productId} an "Opening stock" RECEIVE_STOCK for each product, taken from the
//                                    TEST `stock` value written by seed-products.js
// Stock is never stored: the app derives it from these transactions. Existing documents are left
// untouched, so rerunning is safe. Uses the Firebase Admin SDK, so it only ever runs locally in Node.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run seed:ledger

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "testing-f3b2c";

const SALESMEN = [
  { id: "raj_001", name: "Raj", phone: "98250 11223" },
  { id: "amit_001", name: "Amit", phone: "98981 44556" },
];

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

// Business date of an instant: India (Asia/Kolkata, UTC+5:30, no DST), as the app files transactions.
const businessDate = (d) => {
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
};
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function main() {
  console.log(`Firebase ledger seed — TEST data (project: ${PROJECT_ID})\n`);

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    fail(
      "GOOGLE_APPLICATION_CREDENTIALS is not set.\n" +
        "  Set it to the path of the service-account JSON (kept outside src/, git-ignored).",
    );
  }

  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();

  // The owner is recorded as the person who received the opening stock.
  const owners = await db.collection("users").where("role", "==", "owner").where("active", "==", true).get();
  if (owners.size !== 1) fail(`Expected exactly one active owner in users/, found ${owners.size}. Run seed:users first.`);
  const ownerUid = owners.docs[0].id;

  const products = await db.collection("products").get();
  if (products.empty) fail("No products found. Run seed:products first.");

  const now = new Date();
  const writes = [];

  for (const s of SALESMEN) {
    const ref = db.doc(`salesmen/${s.id}`);
    if ((await ref.get()).exists) {
      console.log(`• salesmen/${s.id} already exists — left as is`);
    } else {
      writes.push({ ref, data: { name: s.name, phone: s.phone, active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } });
      console.log(`✓ salesmen/${s.id} → ${s.name}`);
    }
  }

  // Seeds live under the date they were written, so "already seeded" means any date: look at every entry id once.
  const seeded = new Set((await db.collectionGroup("entries").get()).docs.map((d) => d.id));
  for (const p of products.docs) {
    const qty = Number(p.get("stock") ?? 0);
    if (!Number.isInteger(qty) || qty < 0) fail(`products/${p.id}: stock must be a whole number >= 0 (got ${p.get("stock")}).`);
    if (qty === 0) continue;
    if (seeded.has(`seed-${p.id}`)) continue; // already seeded on some date
    const ref = db.doc(`transactions/${businessDate(now)}/entries/seed-${p.id}`);
    writes.push({
      ref,
      data: { id: `seed-${p.id}`, type: "RECEIVE_STOCK", at: now.toISOString(), date: businessDate(now), businessDate: businessDate(now), createdAt: FieldValue.serverTimestamp(), productId: p.id, qty, userId: ownerUid, note: "Opening stock" },
    });
  }
  const opening = writes.filter((w) => w.ref.path.startsWith("transactions/")).length;
  // Each date that now has entries needs its (light) date document.
  const day = businessDate(now);
  if (opening > 0 && !(await db.doc(`transactions/${day}`).get()).exists) writes.push({ ref: db.doc(`transactions/${day}`), data: { date: day, updatedAt: FieldValue.serverTimestamp() } });

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((w) => batch.create(w.ref, w.data));
    await batch.commit();
  }

  console.log(`\n${opening} opening-stock transactions written (${products.size - opening} products skipped: zero stock or already seeded).`);
}

main().catch((err) => fail(err.message));
