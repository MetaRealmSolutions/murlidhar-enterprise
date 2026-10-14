// ONE-TIME BACKFILL: gives older stock receipts a party record and a `partyId`.
//
// Parties are identified by their 10-digit mobile number (parties/{mobile}). Receipts recorded before that have only
// a free-text partyName / partyPhone. For every RECEIVE_STOCK entry without a `partyId` this script:
//   - takes the saved number ONLY when, after removing spaces and hyphens, it is exactly 10 digits;
//   - creates parties/{mobile} if it is missing (name = the name on the newest receipt of that number), never changing an existing party;
//   - sets `partyId` on the entry, and nothing else: quantities, products.stock and the receipts themselves are never touched.
// Entries whose number is missing or not a clean 10-digit mobile are NOT merged or guessed: they are listed for a manual check
// and left exactly as they are. Two different names on one number are reported (they become one party, as the number is the identity).
//
// Dry run by default (prints the plan). Pass --apply to write. Safe to run again: entries that already have a partyId are skipped.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/backfill-parties.js
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/backfill-parties.js --apply

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "testing-f3b2c";
const APPLY = process.argv.includes("--apply");

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log(`Party backfill (project: ${PROJECT_ID}) — ${APPLY ? "APPLYING" : "dry run, nothing is written"}\n`);
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) fail("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();

  // Date-wise ledger: transactions/{yyyy-mm-dd}/entries/{id}
  const snap = await db.collectionGroup("entries").get();
  const todo = snap.docs.filter((d) => {
    const x = d.data();
    return x.type === "RECEIVE_STOCK" && x.note !== "Opening stock" && !x.partyId;
  });

  const byMobile = new Map(); // mobile -> [{ id, name, at }]
  const review = []; // entries with no reliable mobile number
  for (const d of todo) {
    const x = d.data();
    const mobile = String(x.partyPhone ?? "").replace(/[\s-]/g, "");
    if (/^\d{10}$/.test(mobile)) {
      if (!byMobile.has(mobile)) byMobile.set(mobile, []);
      byMobile.get(mobile).push({ id: d.id, ref: d.ref, name: String(x.partyName ?? ""), at: String(x.at ?? "") });
    } else {
      review.push({ id: d.id, name: x.partyName, phone: x.partyPhone, at: x.at });
    }
  }

  console.log(`${todo.length} receipt entries have no partyId: ${todo.length - review.length} with a usable mobile number, ${review.length} to review by hand.\n`);

  for (const [mobile, entries] of byMobile) {
    entries.sort((a, b) => b.at.localeCompare(a.at));
    const names = [...new Set(entries.map((e) => e.name.trim()).filter(Boolean))];
    const existing = await db.collection("parties").doc(mobile).get();
    const name = existing.exists ? existing.data().name : entries.find((e) => e.name.trim())?.name.trim() || mobile;
    console.log(`  ${mobile}  ${existing.exists ? "party exists" : "NEW party"} "${name}"  ${entries.length} entries${names.length > 1 ? `  (names seen: ${names.join(" | ")})` : ""}`);
    if (!APPLY) continue;
    if (!existing.exists) {
      await db.collection("parties").doc(mobile).create({ name, mobile, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }).catch((e) => {
        if (e.code !== 6) throw e; // 6 = ALREADY_EXISTS: another run created it meanwhile; fine
      });
    }
    for (let i = 0; i < entries.length; i += 400) {
      const batch = db.batch();
      for (const e of entries.slice(i, i + 400)) batch.update(e.ref, { partyId: mobile });
      await batch.commit();
    }
  }

  if (review.length) {
    console.log("\nNEEDS MANUAL REVIEW (left unchanged, not merged):");
    for (const r of review) console.log(`  tx ${r.id}  ${r.at}  name="${r.name ?? ""}"  phone="${r.phone ?? ""}"`);
  }
  console.log(APPLY ? "\nDone." : "\nDry run only. Re-run with --apply to write.");
}

main().catch((e) => fail(e.message));
