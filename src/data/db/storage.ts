import { DB_VERSION, type Database } from './schema';

// Where the development database is kept between runs.
//
//  - Web: window.localStorage, so data survives a reload.
//  - Android / iOS: no storage package is installed yet, so data lives for the session only.
//    To persist on devices, install one (e.g. `npx expo install @react-native-async-storage/async-storage`)
//    and implement `KeyValueStore` with it below; nothing else in the app has to change.

type KeyValueStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

const memory = new Map<string, string>();

function createStore(): KeyValueStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) {
      ls.setItem('__probe', '1');
      ls.removeItem('__probe');
      return {
        get: (k) => ls.getItem(k),
        set: (k, v) => ls.setItem(k, v),
        remove: (k) => ls.removeItem(k),
      };
    }
  } catch {
    // storage blocked (private mode, quota): fall back to memory
  }
  return {
    get: (k) => memory.get(k) ?? null,
    set: (k, v) => void memory.set(k, v),
    remove: (k) => void memory.delete(k),
  };
}

const store = createStore();

const DB_KEY = 'murlidhar-local-db';
const SESSION_KEY = 'murlidhar-local-session';

/** The saved database, or null if there is none or it was written by another version. */
export function loadDatabase(): Database | null {
  try {
    const raw = store.get(DB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Database;
    return parsed && parsed.version === DB_VERSION && Array.isArray(parsed.transactions) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDatabase(db: Database) {
  try {
    store.set(DB_KEY, JSON.stringify(db));
  } catch {
    // out of space etc.: keep running on the in-memory copy
  }
}

export function clearDatabase() {
  store.remove(DB_KEY);
}

/** The signed-in user id, kept so a reload does not sign the tester out. */
export function loadSessionUserId(): string | null {
  return store.get(SESSION_KEY);
}

export function saveSessionUserId(id: string | null) {
  if (id) store.set(SESSION_KEY, id);
  else store.remove(SESSION_KEY);
}
