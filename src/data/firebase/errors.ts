import { FirebaseError } from 'firebase/app';

/** Turns an SDK error into a message that is safe to show. Never exposes Firebase internals. */
export function friendlyError(e: unknown, fallback: string): string {
  const code = e instanceof FirebaseError ? e.code : '';
  if (code === 'permission-denied') return 'You do not have permission to do that.';
  if (code === 'unavailable' || code === 'auth/network-request-failed' || code === 'deadline-exceeded') {
    return 'Network connection unavailable. Please check your connection and try again.';
  }
  return fallback;
}

/**
 * Waits for a write to reach the server, but not forever: Firestore queues writes while offline and
 * only confirms them on reconnect, so after `ms` the change is treated as saved locally (the listeners
 * already show it). A genuine rejection (e.g. permission denied) still throws.
 */
export function settle(write: Promise<unknown>, ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    write.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
