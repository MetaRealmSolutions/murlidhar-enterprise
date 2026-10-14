import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { Platform } from 'react-native';

import { app } from '../../../config/firebase';

// Web keeps an IndexedDB cache so the app opens offline and queues writes while the network is down.
// Native uses the SDK's default in-memory cache (no custom storage layer).
const canPersist = Platform.OS === 'web' && typeof indexedDB !== 'undefined';

export const db = canPersist
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : getFirestore(app);
