import AsyncStorage from '@react-native-async-storage/async-storage';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';

import { app } from '../../../config/firebase';

// Native: keep the Firebase session in AsyncStorage so it survives an app restart.
export const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
