import type { Persistence } from 'firebase/auth';

// The React Native build of firebase/auth exports getReactNativePersistence at runtime, but the
// default type entry point does not declare it. This declares it (only used by auth.native.ts).
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
