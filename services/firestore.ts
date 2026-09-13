import {
  doc,
  collection,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserProfile } from './auth';

/**
 * Subscribes to the real-time user document
 */
export function subscribeToUserDoc(
  uid: string,
  onUpdate: (profile: UserProfile | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const userDocRef = doc(db, 'users', uid);
  return onSnapshot(
    userDocRef,
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as UserProfile);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error('Error listening to user document:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Updates the user's tracked teammates list in Firestore
 */
export async function updateTrackedMembers(uid: string, trackingList: string[]): Promise<void> {
  const cleanList = Array.from(new Set(trackingList.map((m) => m.trim()).filter(Boolean)));
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    trackingList: cleanList,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribes to registered community members list in Firestore
 */
export function subscribeToCommunityMembers(
  onUpdate: (members: UserProfile[]) => void,
  maxLimit = 50
): Unsubscribe {
  const membersQuery = query(
    collection(db, 'users'),
    orderBy('createdAt', 'desc'),
    limit(maxLimit)
  );

  return onSnapshot(
    membersQuery,
    (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((docSnap) => {
        list.push(docSnap.data() as UserProfile);
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Community members subscription error:', err.message);
    }
  );
}

/**
 * Registers or updates a device push token in users/{uid}/devices/{deviceId}
 */
export async function registerDeviceToken(
  uid: string,
  token: string,
  platform: 'android' | 'ios' | 'web' = 'android'
): Promise<void> {
  try {
    const cleanToken = token.trim();
    if (!cleanToken || !uid) return;

    // Use token hash/identifier as device ID
    const deviceId = cleanToken.replace(/[^a-zA-Z0-9_-]/g, '').slice(-32) || 'default-device';
    const deviceDocRef = doc(db, 'users', uid, 'devices', deviceId);

    await setDoc(
      deviceDocRef,
      {
        token: cleanToken,
        platform,
        lastSeenAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Could not register device token in Firestore:', err);
  }
}

