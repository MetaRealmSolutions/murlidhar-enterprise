// ONE-TIME DEV SCRIPT: seeds Firestore `products/{productId}` for the TEST Firebase project.
// The data is intentionally FAKE: the first 50 names from src/data/db/seed.ts with the same
// generated amount / commission / stock that seed.ts produces. Not Murlidhar's real prices.
// Uses the Firebase Admin SDK, so it must only ever run locally in Node (never import from src/).
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run seed:products
//
// Env vars may also be placed in a git-ignored `.env.local` (loaded by the npm script).

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "testing-f3b2c";
const EXPECTED_COUNT = 50;

// First 50 entries of NAMES in src/data/db/seed.ts (same order, same spelling).
const NAMES = [
  "NYLE & CONDINER", "BANSI TEL R", "NIHAR COCONUT", "MALABAR BOTTEL", "MALABAR DABBA", "BANSI COMBO",
  "BATH SOAP 30 SELL", "BATH SOAP 120 SELL", "GLEMER 100 SELL", "SANTOOR", "VIVEL", "LUX", "LIRIL",
  "MARGO & SOFTNES", "ANCHOR", "CLOSUP & PATNJALI", "DABAR RED", "CAVIGO", "AGARBATTI", "MOP", "TOOTHBRUSH",
  "DRAIN CLEANER", "DRUM CLEANER", "SMELL DROP", "AIR FRESHENER", "FINAL GOLI", "PITAMBRI POUCH",
  "SINGAL HOCKEY BRUSH", "DOUBAL HOCKEY BRUSH", "PREMIUM HOCKEY BRUSH", "STEEL & NYLON JALI", "ROOMAL JALI",
  "COLOR SCRUBER", "BLACK SCRUBER", "KAPDA BRUSH", "WIPER", "CHINA DORI", "PAPER SOAP", "FRIDGE MATT", "LIGHTER",
  "PANI GARNI", "STEEL JARI", "WASHING MACHINE STAND", "MAXO REFIEL", "NAVA JALI LUFA", "MATKA STAND",
  "LAXMAN REKHA", "JELL & FACWASS", "TANISH", "PANDA",
];

// Same generator as src/data/db/seed.ts (fake TEST values).
const PRICES = [30, 40, 60, 80, 100, 120, 150, 180, 200, 250, 300, 350, 450, 600];
const FIXED = {
  "BANSI TEL R": { amount: 500, commission: 20, stock: 100 },
  "NIHAR COCONUT": { amount: 300, commission: 15, stock: 50 },
};

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildProducts() {
  return NAMES.map((name, i) => {
    const fixed = FIXED[name];
    const amount = fixed?.amount ?? PRICES[(i * 7 + 3) % PRICES.length];
    const commission = fixed?.commission ?? Math.max(2, Math.round(amount * 0.06));
    const stock = fixed?.stock ?? (i % 17 === 0 ? 0 : ((i * 137) % 1850) + 12);
    return { id: slugify(name), data: { name, amount, commission, stock, active: true } };
  });
}

function validate(products) {
  const errors = [];
  if (products.length !== EXPECTED_COUNT) errors.push(`Expected exactly ${EXPECTED_COUNT} products, got ${products.length}.`);
  const ids = new Set();
  const names = new Set();
  for (const { id, data } of products) {
    const label = `"${data.name}"`;
    if (typeof data.name !== "string" || !data.name.trim()) errors.push(`Product has an empty name (id "${id}").`);
    if (!id) errors.push(`${label}: empty product ID.`);
    for (const field of ["amount", "commission", "stock"]) {
      const v = data[field];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) errors.push(`${label}: ${field} must be a number >= 0 (got ${v}).`);
    }
    if (ids.has(id)) errors.push(`${label}: duplicate product ID "${id}".`);
    if (names.has(data.name)) errors.push(`${label}: duplicate product name.`);
    ids.add(id);
    names.add(data.name);
  }
  return errors;
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log(`Firebase product seed — TEST data (project: ${PROJECT_ID})\n`);

  const products = buildProducts();
  const errors = validate(products);
  if (errors.length) fail(`Validation failed, nothing was written:\n  - ${errors.join("\n  - ")}`);

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    fail(
      "GOOGLE_APPLICATION_CREDENTIALS is not set.\n" +
        "  Firebase Console → Project settings → Service accounts → Generate new private key.\n" +
        "  Save it OUTSIDE src/ (git-ignored name, e.g. serviceAccountKey.json), then set:\n" +
        "    GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json",
    );
  }

  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();

  // Read existing docs first so createdAt is only set on creation.
  const refs = products.map((p) => db.doc(`products/${p.id}`));
  const snaps = await db.getAll(...refs);

  // Firestore batches allow up to 500 writes; 50 fits in one, but chunk anyway.
  const CHUNK = 400;
  for (let start = 0; start < products.length; start += CHUNK) {
    const batch = db.batch();
    products.slice(start, start + CHUNK).forEach((p, j) => {
      const exists = snaps[start + j].exists;
      batch.set(
        refs[start + j],
        { ...p.data, ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    });
    await batch.commit();
  }

  for (const p of products) console.log(`✓ products/${p.id} → ${p.data.name}`);
  console.log(`\n${products.length} products written successfully.`);
}

main().catch((err) => fail(err.message));
