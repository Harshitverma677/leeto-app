import {
  collection,
  doc,
  addDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface AppNotification {
  id: string;
  recipientId: string;
  senderId?: string;
  type: 'solve' | 'streak' | 'reminder' | 'system' | 'teammate';
  title: string;
  message: string;
  read: boolean;
  createdAt: any;
  metadata?: Record<string, any>;
}

/**
 * Subscribes to real-time notifications for the current authenticated user
 */
export function subscribeToNotifications(
  recipientUid: string,
  onUpdate: (notifications: AppNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const notifQuery = query(
    collection(db, 'notifications'),
    where('recipientId', '==', recipientUid),
    limit(50)
  );

  return onSnapshot(
    notifQuery,
    (snapshot) => {
      const notifications: AppNotification[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        notifications.push({
          id: docSnap.id,
          recipientId: data.recipientId,
          senderId: data.senderId,
          type: data.type || 'system',
          title: data.title || '',
          message: data.message || '',
          read: Boolean(data.read),
          createdAt: data.createdAt ? data.createdAt.toDate?.() || new Date() : new Date(),
          metadata: data.metadata || {},
        });
      });
      notifications.sort((a, b) => {
        const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return (timeB || 0) - (timeA || 0);
      });
      onUpdate(notifications);
    },
    (error) => {
      console.warn('Notifications subscription error:', error.message);
      if (onError) onError(error);
    }
  );
}

/**
 * Marks an individual notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const notifRef = doc(db, 'notifications', notificationId);
  await updateDoc(notifRef, {
    read: true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Marks all notifications for a user as read using a Firestore batch
 */
export async function markAllNotificationsAsRead(
  unreadNotificationIds: string[]
): Promise<void> {
  if (unreadNotificationIds.length === 0) return;

  const batch = writeBatch(db);
  for (const id of unreadNotificationIds) {
    const notifRef = doc(db, 'notifications', id);
    batch.update(notifRef, {
      read: true,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/**
 * Permanently deletes an individual notification
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  const notifRef = doc(db, 'notifications', notificationId);
  await deleteDoc(notifRef);
}

/**
 * Permanently deletes all given notifications using a batch delete
 */
export async function clearAllNotifications(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;

  const batch = writeBatch(db);
  for (const id of notificationIds) {
    const notifRef = doc(db, 'notifications', id);
    batch.delete(notifRef);
  }
  await batch.commit();
}


/**
 * Emits a real-time notification to a recipient
 */
export async function sendNotification(notification: {
  recipientId: string;
  senderId?: string;
  type: 'solve' | 'streak' | 'reminder' | 'system' | 'teammate';
  title: string;
  message: string;
  metadata?: Record<string, any>;
}): Promise<string> {
  const colRef = collection(db, 'notifications');
  const docRef = await addDoc(colRef, {
    ...notification,
    read: false,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

