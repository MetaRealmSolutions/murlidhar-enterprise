// ONE-TIME DEV SCRIPT: seeds Firestore `users/{authUid}` for the TEST Firebase project.
// Uses the Firebase Admin SDK, so it must only ever run locally in Node (never import from src/).
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//   OWNER_UID=... RAJ_UID=... AMIT_UID=... npm run seed:users
//
// Env vars may also be placed in a git-ignored `.env.local` (loaded by the npm script).

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "testing-f3b2c";

const USERS = [
  { label: "Owner", envKey: "OWNER_UID", data: { email: "owner@test.com", name: "Owner", role: "owner", active: true } },
  { label: "Raj", envKey: "RAJ_UID", data: { email: "raj@test.com", name: "Raj", role: "salesman", salesmanId: "raj_001", active: true } },
  { label: "Amit", envKey: "AMIT_UID", data: { email: "amit@test.com", name: "Amit", role: "salesman", salesmanId: "amit_001", active: true } },
];

const ALLOWED_ROLES = ["owner", "salesman"];

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  console.log(`Firebase user seed (project: ${PROJECT_ID})\n`);

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    fail(
      "GOOGLE_APPLICATION_CREDENTIALS is not set.\n" +
        "  Firebase Console → Project settings → Service accounts → Generate new private key.\n" +
        "  Save it OUTSIDE src/ (git-ignored name, e.g. serviceAccountKey.json), then set:\n" +
        "    GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json",
    );
  }

  const missing = USERS.filter((u) => !process.env[u.envKey]?.trim()).map((u) => u.envKey);
  if (missing.length) fail(`Missing required env var(s): ${missing.join(", ")}`);

  const uids = USERS.map((u) => ({ ...u, uid: process.env[u.envKey].trim() }));
  if (new Set(uids.map((u) => u.uid)).size !== uids.length) {
    fail("OWNER_UID, RAJ_UID and AMIT_UID must all be different.");
  }
  for (const u of uids) {
    if (!ALLOWED_ROLES.includes(u.data.role)) fail(`${u.label}: invalid role "${u.data.role}".`);
  }

  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth();
  const db = getFirestore();

  // Verify every UID exists in Firebase Auth (and matches the expected email) before writing anything.
  let invalid = false;
  for (const u of uids) {
    try {
      const record = await auth.getUser(u.uid);
      if (record.email?.toLowerCase() !== u.data.email) {
        console.error(`✗ ${u.label} UID belongs to "${record.email}", expected "${u.data.email}".`);
        invalid = true;
      }
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        console.error(`✗ ${u.label} UID does not exist in Firebase Authentication.`);
      } else {
        console.error(`✗ ${u.label} UID lookup failed: ${err.message}`);
      }
      invalid = true;
    }
  }
  if (invalid) fail("Nothing was written.");

  const batch = db.batch();
  for (const u of uids) {
    const ref = db.doc(`users/${u.uid}`);
    const exists = (await ref.get()).exists;
    batch.set(
      ref,
      { ...u.data, ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();

  for (const u of uids) console.log(`✓ ${u.label} → users/${u.uid}`);
  console.log(`\n${uids.length} users written successfully.`);
}

main().catch((err) => fail(err.message));
