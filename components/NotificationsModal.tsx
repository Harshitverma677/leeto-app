import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Modal,
} from 'react-native';
import { useNotifications } from '../context/NotificationContext';
import { AppNotification } from '../services/notificationsService';

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  colors: any;
  isDarkMode: boolean;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  visible,
  onClose,
  colors,
}) => {
  const {
    notifications,
    unreadCount,
    markAsRead,
    deleteNotification,
    clearAllNotifications,
  } = useNotifications();

  const getIcon = (type: string) => {
    switch (type) {
      case 'solve':
        return '🎯';
      case 'streak':
        return '🔥';
      case 'reminder':
        return '⏰';
      case 'teammate':
        return '👥';
      default:
        return '⚡';
    }
  };

  const formatTime = (date: any) => {
    if (!date) return 'Just now';
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.head}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Notifications</Text>
              {unreadCount > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.unreadBadgeText}>{unreadCount} new</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {notifications.length > 0 && (
                <TouchableOpacity
                  onPress={clearAllNotifications}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ color: colors.red || '#ef4444', fontSize: 12, fontWeight: '800' }}>
                    Clear all
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeBtn, { backgroundColor: colors.subCardBg }]}
              >
                <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* List */}
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={{ fontSize: 36, marginBottom: 10 }}>🔔</Text>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All caught up!</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  New solves, streak shields, and team updates will appear here in real-time.
                </Text>
              </View>
            }
            renderItem={({ item }: { item: AppNotification }) => (
              <View
                style={[
                  styles.notifItem,
                  { backgroundColor: colors.subCardBg, borderColor: colors.border },
                  !item.read && {
                    borderColor: `${colors.primary}70`,
                    backgroundColor: colors.isDarkMode ? '#ff99000a' : '#ea580c08',
                  },
                ]}
              >
                <View style={[styles.iconContainer, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={{ fontSize: 18 }}>{getIcon(item.type)}</Text>
                </View>

                <TouchableOpacity
                  style={{ flex: 1 }}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (!item.read) markAsRead(item.id);
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text
                      style={[
                        styles.notifTitle,
                        { color: colors.textPrimary },
                        !item.read && { fontWeight: '900' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.timeText, { color: colors.textMuted }]}>
                      {formatTime(item.createdAt)}
                    </Text>
                  </View>

                  <Text
                    style={[styles.notifMessage, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {item.message}
                  </Text>
                </TouchableOpacity>

                {!item.read && (
                  <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                )}

                <TouchableOpacity
                  onPress={() => deleteNotification(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={[styles.dismissBtn, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 5, 10, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 20,
    maxHeight: '80%',
    minHeight: 380,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
  },
  unreadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '900',
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  notifMessage: {
    fontSize: 12,
    lineHeight: 16,
  },
  timeText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 4,
  },
  dismissBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

