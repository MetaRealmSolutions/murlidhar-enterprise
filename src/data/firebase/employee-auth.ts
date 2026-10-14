import { FirebaseError, getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut } from 'firebase/auth';

import { app } from '../../../config/firebase';
import { auth } from './auth';

// Creating a login with the normal auth instance would sign the OWNER in as the new employee. A second Firebase app
// instance (same project, its own session) creates the account instead, then signs out of itself, so the owner stays
// signed in. No administrative credential is involved: it is the public web config the app already uses.
const SECONDARY = 'employee-admin';
const secondaryAuth = () => getAuth(getApps().find((a) => a.name === SECONDARY) ?? initializeApp(app.options, SECONDARY));

/** Creates the Firebase Auth login (email + password) and returns its uid. Throws FirebaseError (e.g. auth/email-already-in-use). */
export async function createLogin(email: string, password: string): Promise<string> {
  const a = secondaryAuth();
  const cred = await createUserWithEmailAndPassword(a, email, password);
  await signOut(a);
  return cred.user.uid;
}

/** Sends Firebase's password-reset email to the login (the employee sets a new password themself; the owner never sees it). */
export function sendReset(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export const isEmailInUse = (e: unknown) => e instanceof FirebaseError && e.code === 'auth/email-already-in-use';
