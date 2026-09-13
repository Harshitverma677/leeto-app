import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDkmg3Pideb3WfA3cSl_vY3J8mTXtVEGO4',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'leetdash-mobile.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'leetdash-mobile',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leetdash-mobile.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '970864529077',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:970864529077:android:9bc101a0420581c23bf8fc',
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

/**
 * Creates a robust React Native AsyncStorage persistence class for Firebase Auth.
 * Firebase Auth requires a class constructor (not an object instance).
 */
function createReactNativePersistenceClass(storage: any) {
  return class ReactNativePersistence {
    static type = 'LOCAL';
    type = 'LOCAL';

    async _isAvailable(): Promise<boolean> {
      try {
        if (!storage) return false;
        await storage.setItem('firebase:persistence:available', '1');
        await storage.removeItem('firebase:persistence:available');
        return true;
      } catch {
        return false;
      }
    }

    async _set(key: string, value: any): Promise<void> {
      try {
        await storage.setItem(key, JSON.stringify(value));
      } catch (_) {}
    }

    async _get(key: string): Promise<any> {
      try {
        const json = await storage.getItem(key);
        return json ? JSON.parse(json) : null;
      } catch (_) {
        return null;
      }
    }

    async _remove(key: string): Promise<void> {
      try {
        await storage.removeItem(key);
      } catch (_) {}
    }

    _addListener(): void {}
    _removeListener(): void {}
  };
}

let auth: Auth;
try {
  const persistenceClass = createReactNativePersistenceClass(AsyncStorage);
  auth = initializeAuth(app, {
    persistence: persistenceClass as any,
  });
} catch (_) {
  auth = getAuth(app);
}

const db: Firestore = getFirestore(app);

export { app, auth, db };
