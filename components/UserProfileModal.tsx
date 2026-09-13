import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Image,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

interface UserProfileModalProps {
  visible: boolean;
  onClose: () => void;
  colors: any;
  onSignOut: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  visible,
  onClose,
  colors,
  onSignOut,
}) => {
  const { profile, user } = useAuth();

  if (!profile) return null;

  const handleSignOutConfirm = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of LeetDash?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            onClose();
            onSignOut();
          },
        },
      ]
    );
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
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
            <Text style={[styles.title, { color: colors.textPrimary }]}>Account Profile</Text>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.subCardBg }]}
            >
              <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Avatar & User Details */}
          <View style={styles.profileCard}>
            {profile.photoURL ? (
              <Image
                source={{ uri: profile.photoURL }}
                style={[styles.avatar, { borderColor: colors.primary }]}
              />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}>
                <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                  {getInitials(profile.displayName || profile.username)}
                </Text>
              </View>
            )}

            <Text style={[styles.displayName, { color: colors.textPrimary }]}>
              {profile.displayName || profile.username}
            </Text>
            <Text style={[styles.usernameHandle, { color: colors.textMuted }]}>
              @{profile.username}
            </Text>

            {/* Email verification badge */}
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: profile.emailVerified ? `${colors.green}20` : `${colors.yellow}20`,
                  borderColor: profile.emailVerified ? colors.green : colors.yellow,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: profile.emailVerified ? colors.green : colors.yellow },
                ]}
              >
                {profile.emailVerified ? '✓ Email Verified' : '⚠️ Unverified Email'}
              </Text>
            </View>
          </View>

          {/* Info Rows */}
          <View style={[styles.infoSection, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Email</Text>
              <Text style={[styles.infoVal, { color: colors.textPrimary }]}>{profile.email}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>LeetCode Handle</Text>
              <Text style={[styles.infoVal, { color: colors.primary, fontWeight: '800' }]}>
                @{profile.leetCodeHandle || profile.username}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Tracked Teammates</Text>
              <Text style={[styles.infoVal, { color: colors.cyan, fontWeight: '800' }]}>
                {profile.trackingList?.length || 0} Members
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>UID</Text>
              <Text style={[styles.infoVal, { color: colors.textMuted, fontSize: 11 }]}>
                {user?.uid.slice(0, 16)}...
              </Text>
            </View>
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOutConfirm}
            activeOpacity={0.8}
          >
            <Text style={styles.signOutBtnText}>🚪 Sign Out</Text>
          </TouchableOpacity>
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
    padding: 22,
    maxHeight: '85%',
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
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
  profileCard: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    marginBottom: 10,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '900',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '900',
  },
  usernameHandle: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  infoSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  signOutBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#f43f5e18',
    borderWidth: 1,
    borderColor: '#f43f5e50',
    marginBottom: 10,
  },
  signOutBtnText: {
    color: '#f43f5e',
    fontSize: 14,
    fontWeight: '900',
  },
});

