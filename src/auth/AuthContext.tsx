import { FirebaseError } from 'firebase/app';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User as FirebaseUser } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { setActiveProfile, startSync, stopSync } from '../data/db/database';
import type { Role, UserProfile } from '../data/db/schema';
import { auth } from '../data/firebase/auth';
import { friendlyError } from '../data/firebase/errors';
import { fetchUserProfile, subscribeUserProfile } from '../data/firebase/repositories/users';

export type { Role };

/** The signed-in user as the app sees it: the Firestore profile (users/{uid}), which owns the role. */
export type User = UserProfile;

export type SignInResult = { ok: true } | { ok: false; error: string };

type AuthContextValue = {
  /** The Firebase Auth user. */
  firebaseUser: FirebaseUser | null;
  /** The application profile from users/{uid}; null until signed in with a valid, active profile. */
  user: User | null;
  /** True while Firebase restores the session or the profile is being checked. */
  loading: boolean;
  /** Why access was refused after a successful Firebase sign-in (missing profile, inactive, unknown role). */
  accessError: string | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const BAD_CREDENTIALS = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];

function signInMessage(e: unknown) {
  const code = e instanceof FirebaseError ? e.code : '';
  if (BAD_CREDENTIALS.includes(code)) return 'Invalid email or password.';
  if (code === 'auth/user-disabled') return 'Account is not active.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a moment and try again.';
  return friendlyError(e, 'Unable to sign in. Please try again.');
}

// The one place that knows who is signed in. Firebase Auth is the source of truth (it restores the
// session after a reload); the role and salesman identity come from the users/{uid} document.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  // Only the latest auth event may apply its result.
  const run = useRef(0);
  // The role + permissions the data listeners were started for (see the profile listener below).
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (fbUser) => {
      const mine = ++run.current;
      const deny = (message: string) => {
        if (mine !== run.current) return;
        setAccessError(message);
        setFirebaseUser(null);
        setUser(null);
        stopSync();
        setLoading(false);
        firebaseSignOut(auth).catch(() => undefined);
      };

      if (!fbUser) {
        stopSync();
        setFirebaseUser(null);
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      fetchUserProfile(fbUser.uid).then(
        (profile) => {
          if (mine !== run.current) return;
          if (profile === undefined) return deny('Account profile is not configured. Please contact the administrator.');
          if (profile === null) return deny('This account has an unsupported role. Please contact the administrator.');
          if (!profile.active) return deny('Account is not active.');
          if (profile.role === 'salesman' && !profile.salesmanId) return deny('Account profile is not configured. Please contact the administrator.');
          setAccessError(null);
          setFirebaseUser(fbUser);
          setUser(profile);
          startSync(profile);
          setLoading(false);
        },
        (e) => deny(friendlyError(e, 'Unable to load your account profile.')),
      );
    });
  }, []);

  // Keep the profile live: when the owner changes this person's permissions (or deactivates them) it takes effect at once,
  // without signing in again.
  useEffect(() => {
    loaded.current = null;
    if (!firebaseUser) return;
    return subscribeUserProfile(
      firebaseUser.uid,
      (profile) => {
        if (!profile || !profile.active) {
          firebaseSignOut(auth).catch(() => undefined);
          return;
        }
        setUser(profile);
        setActiveProfile(profile);
        // The data that is listened to depends on the permissions: start again when they (or the role) change.
        const signature = JSON.stringify([profile.role, profile.permissions]);
        if (loaded.current !== null && loaded.current !== signature) startSync(profile);
        loaded.current = signature;
      },
      () => undefined,
    );
  }, [firebaseUser]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    setAccessError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: signInMessage(e) };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch {
      // The auth listener clears the session either way; nothing to show.
    }
  }, []);

  const value = useMemo(
    () => ({ firebaseUser, user, loading, accessError, signIn, signOut }),
    [firebaseUser, user, loading, accessError, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * The signed-in salesman account, or null for anyone else. Salesman screens take the salesman id
 * from here, never from route params or props, so a salesman can only ever read their own data
 * (the Firestore rules enforce the same boundary on the server).
 */
export function useSalesmanSession(): { user: User; salesmanId: string } | null {
  const { user } = useAuth();
  if (!user || user.role !== 'salesman' || !user.salesmanId) return null;
  return { user, salesmanId: user.salesmanId };
}
