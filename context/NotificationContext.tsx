import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  AppNotification,
  subscribeToNotifications,
  markNotificationAsRead as apiMarkRead,
  markAllNotificationsAsRead as apiMarkAllRead,
  deleteNotification as apiDeleteNotification,
  clearAllNotifications as apiClearAll,
} from '../services/notificationsService';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  latestAlert: AppNotification | null;
  clearLatestAlert: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  latestAlert: null,
  clearLatestAlert: () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  deleteNotification: async () => {},
  clearAllNotifications: async () => {},
});

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [latestAlert, setLatestAlert] = useState<AppNotification | null>(null);
  const [prevCount, setPrevCount] = useState<number>(0);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLatestAlert(null);
      setPrevCount(0);
      return;
    }

    const unsubscribe = subscribeToNotifications(user.uid, (list) => {
      setNotifications(list);

      // If a new unread notification arrives, show a toast alert
      const unreadList = list.filter((n) => !n.read);
      if (unreadList.length > prevCount && list.length > 0) {
        const newest = list[0];
        if (!newest.read) {
          setLatestAlert(newest);
          // Auto-dismiss in-app banner after 5 seconds
          setTimeout(() => {
            setLatestAlert((current) => (current?.id === newest.id ? null : current));
          }, 5000);
        }
      }
      setPrevCount(unreadList.length);
    });

    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await apiMarkRead(id);
    } catch (err) {
      console.warn('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      await apiMarkAllRead(unreadIds);
    } catch (err) {
      console.warn('Failed to mark all as read:', err);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await apiDeleteNotification(id);
    } catch (err) {
      console.warn('Failed to delete notification:', err);
    }
  };

  const clearAllNotifications = async () => {
    try {
      const allIds = notifications.map((n) => n.id);
      await apiClearAll(allIds);
    } catch (err) {
      console.warn('Failed to clear all notifications:', err);
    }
  };

  const clearLatestAlert = () => setLatestAlert(null);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        latestAlert,
        clearLatestAlert,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);

