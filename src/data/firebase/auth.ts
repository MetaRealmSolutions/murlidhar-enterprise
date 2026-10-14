import { getAuth } from 'firebase/auth';

import { app } from '../../../config/firebase';

// Web: the SDK keeps the session in the browser (IndexedDB), so a refresh restores it.
// Native builds use auth.native.ts, which persists the session with AsyncStorage.
export const auth = getAuth(app);
