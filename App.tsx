import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal,
  ScrollView,
  Linking,
  Switch,
  Image,
  Animated,
} from 'react-native';

import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  fetchLeetCodeStats,
  fetchDailyChallenge,
  LeetCodeStats,
  DailyChallenge,
  HeatmapSquare,
} from './services/leetcode';
import {
  requestNotificationPermissions,
  getDevicePushToken,
  triggerLocalSolveNotification,
  triggerStreakShieldAlert,
  scheduleDailyStreakReminder,
  broadcastSolveEvent,
} from './services/notifications';

const STORAGE_KEY = '@leetdash_members';
const OWNER_STORAGE_KEY = '@leetdash_owner_handle';
const LAST_SEEN_SUB_KEY = '@leetdash_last_sub_ids';
const REMINDER_KEY = '@leetdash_reminder_settings';
const THEME_STORAGE_KEY = '@leetdash_theme_preference';

// Cloud Sync Configuration (JSONBin.io)
const JSONBIN_BIN_ID = '6a8adce9da38895dfe06ade0';
const JSONBIN_API_KEY = '$2a$10$q/z2mZGd58JtaJVXLOGB0OUhQHg9cSRyh98eCwHMfPeEF2vN5DXhe';

type SortKey = 'solved' | 'streak' | 'acceptance';

interface ReminderSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

const darkColors = {
  bg: '#0b0f19',
  cardBg: '#131c2e',
  inputBg: '#0b0f19',
  border: '#1e293b',
  borderLight: '#334155',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  primary: '#f97316',
  primaryBg: '#f9731615',
  subCardBg: '#0b0f19',
  statusBar: 'light-content' as const,
};

const lightColors = {
  bg: '#f1f5f9',
  cardBg: '#ffffff',
  inputBg: '#f8fafc',
  border: '#e2e8f0',
  borderLight: '#cbd5e1',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  primary: '#ea580c',
  primaryBg: '#ea580c15',
  subCardBg: '#f8fafc',
  statusBar: 'dark-content' as const,
};

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [ownerHandle, setOwnerHandle] = useState<string | null>(null);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [onboardingInput, setOnboardingInput] = useState('');
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAddInput, setDrawerAddInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<LeetCodeStats[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>('solved');
  const [selectedMember, setSelectedMember] = useState<LeetCodeStats | null>(null);
  const [isTodayTrackScreenOpen, setIsTodayTrackScreenOpen] = useState(false);
  const [dailyProblem, setDailyProblem] = useState<DailyChallenge | null>(null);
  const [selectedDayInfo, setSelectedDayInfo] = useState<HeatmapSquare | null>(null);

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderConfig, setReminderConfig] = useState<ReminderSettings>({
    enabled: true,
    hour: 20,
    minute: 0,
  });

  const [customHour, setCustomHour] = useState('08');
  const [customMinute, setCustomMinute] = useState('00');
  const [isPM, setIsPM] = useState(true);

  const splashScale = useRef(new Animated.Value(0.3)).current;
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashSubOpacity = useRef(new Animated.Value(0)).current;
  const splashContainerOpacity = useRef(new Animated.Value(1)).current;

  const colors = isDarkMode ? darkColors : lightColors;

  const heatmapScrollRef = useRef<ScrollView>(null);
  const lastSeenSubId = useRef<Record<string, string>>({});
  const lastReminderTriggeredDate = useRef<string>('');
  const membersRef = useRef<LeetCodeStats[]>([]);
  const ownerHandleRef = useRef<string | null>(null);
  const dailyProblemRef = useRef<DailyChallenge | null>(null);
  const reminderConfigRef = useRef<ReminderSettings>(reminderConfig);
  const sortByRef = useRef<SortKey>(sortBy);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    ownerHandleRef.current = ownerHandle;
  }, [ownerHandle]);

  useEffect(() => {
    dailyProblemRef.current = dailyProblem;
  }, [dailyProblem]);

  useEffect(() => {
    reminderConfigRef.current = reminderConfig;
  }, [reminderConfig]);

  useEffect(() => {
    sortByRef.current = sortBy;
  }, [sortBy]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (url && typeof url === 'string') {
        Linking.openURL(url);
      }
    });

    return () => subscription.remove();
  }, []);

  // Automatic Cloud Sync Function for Cloud Background Worker
  const syncCloudTracking = async (membersList: string[], token: string | null) => {
    if (!JSONBIN_BIN_ID || JSONBIN_BIN_ID === 'YOUR_BIN_ID_HERE') return;

    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
        headers: { 'X-Master-Key': JSONBIN_API_KEY },
      });
      const currentData = await res.json();
      const existingTokens: string[] = currentData.record?.pushTokens || [];

      if (token && !existingTokens.includes(token)) {
        existingTokens.push(token);
      }

      await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': JSONBIN_API_KEY,
        },
        body: JSON.stringify({
          pushTokens: existingTokens,
          members: membersList,
        }),
      });
      console.log('☁️ Synced team list to cloud worker successfully');
    } catch (err) {
      console.error('Failed to sync to cloud storage:', err);
    }
  };

  useEffect(() => {
    Animated.parallel([
      Animated.spring(splashScale, {
        toValue: 1,
        tension: 30,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(splashOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(splashSubOpacity, {
        toValue: 1,
        duration: 900,
        delay: 250,
        useNativeDriver: true,
      }),
    ]).start();

    requestNotificationPermissions();
    initApp();

    const interval = setInterval(() => {
      AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
        if (saved) refreshTeam(JSON.parse(saved), true, false);
      });
      checkDailyReminder();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const initApp = async () => {
    try {
      const token = await getDevicePushToken();
      if (token) {
        setPushToken(token);
        console.log('====================================');
        console.log('🔑 EXPO PUSH TOKEN:');
        console.log(token);
        console.log('====================================');
      }

      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== null) {
        setIsDarkMode(savedTheme === 'dark');
      }

      const savedOwner = await AsyncStorage.getItem(OWNER_STORAGE_KEY);
      if (savedOwner) {
        setOwnerHandle(savedOwner);
        ownerHandleRef.current = savedOwner;
      }

      const potd = await fetchDailyChallenge();
      setDailyProblem(potd);
      dailyProblemRef.current = potd;

      const savedReminder = await AsyncStorage.getItem(REMINDER_KEY);
      if (savedReminder) {
        const parsedReminder: ReminderSettings = JSON.parse(savedReminder);
        setReminderConfig(parsedReminder);
        reminderConfigRef.current = parsedReminder;

        const isPeriodPM = parsedReminder.hour >= 12;
        const displayH = parsedReminder.hour % 12 === 0 ? 12 : parsedReminder.hour % 12;
        setCustomHour(displayH < 10 ? `0${displayH}` : `${displayH}`);
        setCustomMinute(parsedReminder.minute < 10 ? `0${parsedReminder.minute}` : `${parsedReminder.minute}`);
        setIsPM(isPeriodPM);

        if (parsedReminder.enabled && potd) {
          scheduleDailyStreakReminder(parsedReminder.hour, parsedReminder.minute, potd.title, potd.link);
        }
      }

      const savedSubIds = await AsyncStorage.getItem(LAST_SEEN_SUB_KEY);
      if (savedSubIds) {
        lastSeenSubId.current = JSON.parse(savedSubIds);
      }

      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsedList: string[] = JSON.parse(saved);
        await refreshTeam(parsedList, false, false, potd?.title);
        syncCloudTracking(parsedList, token);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        Animated.timing(splashContainerOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setIsSplashVisible(false));
      }, 900);
    }
  };

  const toggleTheme = async () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode ? 'dark' : 'light');
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? This will disconnect your primary account and reset the board on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove([
              OWNER_STORAGE_KEY,
              STORAGE_KEY,
              LAST_SEEN_SUB_KEY,
            ]);
            setOwnerHandle(null);
            ownerHandleRef.current = null;
            setMembers([]);
            setSelectedMember(null);
            setIsTodayTrackScreenOpen(false);
            setDrawerOpen(false);
            setOnboardingInput('');
            syncCloudTracking([], pushToken);
          },
        },
      ]
    );
  };

  const handleOnboardingSubmit = async () => {
    const clean = onboardingInput.trim();
    if (!clean) {
      Alert.alert('Handle Required', 'Please enter your LeetCode username.');
      return;
    }

    setOnboardingLoading(true);
    const stats = await fetchLeetCodeStats(clean, dailyProblem?.title);
    setOnboardingLoading(false);

    if (!stats) {
      Alert.alert('Account Not Found', 'Could not locate that LeetCode handle. Please verify the spelling.');
      return;
    }

    await AsyncStorage.setItem(OWNER_STORAGE_KEY, stats.username);
    setOwnerHandle(stats.username);
    ownerHandleRef.current = stats.username;

    const currentSaved = await AsyncStorage.getItem(STORAGE_KEY);
    const list: string[] = currentSaved ? JSON.parse(currentSaved) : [];
    if (!list.some((u) => u.toLowerCase() === stats.username.toLowerCase())) {
      list.push(stats.username);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      setMembers(sortList([...members, stats], sortBy));
      syncCloudTracking(list, pushToken);
    }
  };

  const checkDailyReminder = () => {
    const config = reminderConfigRef.current;
    if (!config.enabled) return;

    const currentOwner = ownerHandleRef.current;
    if (!currentOwner) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (
      lastReminderTriggeredDate.current !== todayStr &&
      now.getHours() === config.hour &&
      now.getMinutes() >= config.minute
    ) {
      const ownerMember = membersRef.current.find(
        (m) => m.username.toLowerCase() === currentOwner.toLowerCase()
      );

      if (ownerMember && !ownerMember.solvedDailyToday && dailyProblemRef.current) {
        lastReminderTriggeredDate.current = todayStr;
        triggerStreakShieldAlert(dailyProblemRef.current.title, dailyProblemRef.current.link);
      }
    }
  };

  const saveReminderSettings = async (nextConfig: ReminderSettings) => {
    setReminderConfig(nextConfig);
    reminderConfigRef.current = nextConfig;
    await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify(nextConfig));

    if (nextConfig.enabled && dailyProblemRef.current) {
      scheduleDailyStreakReminder(
        nextConfig.hour,
        nextConfig.minute,
        dailyProblemRef.current.title,
        dailyProblemRef.current.link
      );
    }
  };

  const handleApplyCustomTime = () => {
    let h = parseInt(customHour, 10);
    let m = parseInt(customMinute, 10);

    if (isNaN(h) || h < 1 || h > 12) h = 8;
    if (isNaN(m) || m < 0 || m > 59) m = 0;

    let hour24 = h;
    if (isPM && h < 12) hour24 = h + 12;
    if (!isPM && h === 12) hour24 = 0;

    const updatedConfig: ReminderSettings = {
      ...reminderConfig,
      enabled: true,
      hour: hour24,
      minute: m,
    };

    saveReminderSettings(updatedConfig);
    setShowReminderModal(false);
    Alert.alert(
      'Reminder Set',
      `Streak reminder scheduled for ${formatReminderTime(hour24, m)} daily.`
    );
  };

  const getProblemUrlFromTitle = (title: string) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `https://leetcode.com/problems/${slug}/`;
  };

  const sortList = (list: LeetCodeStats[], key: SortKey) => {
    return [...list].sort((a, b) => {
      if (key === 'solved') return b.totalSolved - a.totalSolved;
      if (key === 'streak') return (b.streak || 0) - (a.streak || 0);
      if (key === 'acceptance') return b.acceptanceRate - a.acceptanceRate;
      return 0;
    });
  };

  const refreshTeam = async (
    usernames: string[],
    notify = true,
    showSpinner = false,
    dailyTitle?: string
  ) => {
    if (showSpinner) setRefreshing(true);
    const activeDailyTitle = dailyTitle || dailyProblemRef.current?.title;
    const updated: LeetCodeStats[] = [];

    for (const name of usernames) {
      const stats = await fetchLeetCodeStats(name, activeDailyTitle);
      if (stats) {
        updated.push(stats);

        const latestSub = stats.recentSubmissions?.[0];
        const prevId = lastSeenSubId.current[stats.username];

        if (latestSub && latestSub.title) {
          const currentId = latestSub.id || latestSub.title;
          if (notify && prevId && prevId !== currentId) {
            const problemUrl = getProblemUrlFromTitle(latestSub.title);
            const playerName = stats.realName || stats.username;

            triggerLocalSolveNotification(
              playerName,
              latestSub.title,
              problemUrl
            );
            broadcastSolveEvent(
              stats.username,
              playerName,
              latestSub.title,
              problemUrl
            );
          }
          lastSeenSubId.current[stats.username] = currentId;
        }
      }
    }

    await AsyncStorage.setItem(LAST_SEEN_SUB_KEY, JSON.stringify(lastSeenSubId.current));
    setMembers(sortList(updated, sortByRef.current));
    if (showSpinner) setRefreshing(false);
  };

  const handleAddTeammate = async () => {
    if (!drawerAddInput.trim()) return;
    const clean = drawerAddInput.trim();

    if (members.some((m) => m.username.toLowerCase() === clean.toLowerCase())) {
      Alert.alert('Duplicate', 'This user is already on the board.');
      return;
    }

    setLoading(true);
    const stats = await fetchLeetCodeStats(clean, dailyProblem?.title);
    setLoading(false);

    if (!stats) {
      Alert.alert('Not Found', 'Could not find a LeetCode user with that username.');
      return;
    }

    const latestSub = stats.recentSubmissions?.[0];
    if (latestSub) {
      lastSeenSubId.current[stats.username] = latestSub.id || latestSub.title;
      await AsyncStorage.setItem(LAST_SEEN_SUB_KEY, JSON.stringify(lastSeenSubId.current));
    }

    const nextList = sortList([...members, stats], sortBy);
    setMembers(nextList);
    setDrawerAddInput('');
    const usernames = nextList.map((m) => m.username);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(usernames));
    syncCloudTracking(usernames, pushToken);
    setDrawerOpen(false);
    Alert.alert('Added', `@${stats.username} joined the board!`);
  };

  const testSolveAlert = () => {
    if (members.length === 0) {
      Alert.alert('Add a member first', 'Add at least one LeetCode user to test alerts.');
      return;
    }

    let latestSolveInfo: {
      playerName: string;
      username: string;
      problemTitle: string;
      rawTimestamp: number;
    } | null = null;

    for (const member of members) {
      if (member.recentSubmissions && member.recentSubmissions.length > 0) {
        const topSub = member.recentSubmissions[0];
        const subTime = topSub.rawTimestamp || 0;

        if (!latestSolveInfo || subTime > latestSolveInfo.rawTimestamp) {
          latestSolveInfo = {
            playerName: member.realName || member.username,
            username: member.username,
            problemTitle: topSub.title,
            rawTimestamp: subTime,
          };
        }
      }
    }

    if (latestSolveInfo) {
      const problemUrl = getProblemUrlFromTitle(latestSolveInfo.problemTitle);

      triggerLocalSolveNotification(
        latestSolveInfo.playerName,
        latestSolveInfo.problemTitle,
        problemUrl
      );
      broadcastSolveEvent(
        latestSolveInfo.username,
        latestSolveInfo.playerName,
        latestSolveInfo.problemTitle,
        problemUrl
      );
      return;
    }

    const fallbackUser = members[0];
    const fallbackProblem = dailyProblem?.title || 'Two Sum';
    const fallbackUrl = dailyProblem?.link || getProblemUrlFromTitle(fallbackProblem);
    const playerName = fallbackUser.realName || fallbackUser.username;

    triggerLocalSolveNotification(playerName, fallbackProblem, fallbackUrl);
    broadcastSolveEvent(fallbackUser.username, playerName, fallbackProblem, fallbackUrl);
  };

  const handleSortChange = (key: SortKey) => {
    setSortBy(key);
    setMembers(sortList(members, key));
  };

  const removeMember = async (username: string) => {
    if (ownerHandle && username.toLowerCase() === ownerHandle.toLowerCase()) {
      Alert.alert('Primary Account', 'You cannot remove your primary owner account from tracking.');
      return;
    }
    const nextList = members.filter((m) => m.username !== username);
    setMembers(nextList);
    delete lastSeenSubId.current[username];
    await AsyncStorage.setItem(LAST_SEEN_SUB_KEY, JSON.stringify(lastSeenSubId.current));
    const usernames = nextList.map((m) => m.username);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(usernames));
    syncCloudTracking(usernames, pushToken);
  };

  const openLeetCodeProfile = (username: string) => {
    Linking.openURL(`https://leetcode.com/u/${username}`);
  };

  const openProblemUrl = (titleOrUrl: string) => {
    if (titleOrUrl.startsWith('http')) {
      Linking.openURL(titleOrUrl);
    } else {
      Linking.openURL(getProblemUrlFromTitle(titleOrUrl));
    }
  };

  const getTodaySolvesGroupedByMember = () => {
    const now = new Date();
    const startOfTodayUtc = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);

    return members.map((member) => {
      const todaySubmissions = (member.recentSubmissions || []).filter((sub) => {
        if (!sub.rawTimestamp || sub.rawTimestamp === 0) return false;
        return sub.rawTimestamp >= startOfTodayUtc;
      });

      return {
        ...member,
        todaySubmissions,
      };
    });
  };

  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      m.username.toLowerCase().includes(q) ||
      (m.realName && m.realName.toLowerCase().includes(q))
    );
  });

  const getRankBadgeDesign = (index: number) => {
    if (index === 0) return { bg: '#eab30825', border: '#eab308', text: '#facc15', label: '1 👑' };
    if (index === 1) return { bg: isDarkMode ? '#94a3b825' : '#cbd5e150', border: '#94a3b8', text: isDarkMode ? '#cbd5e1' : '#475569', label: '2' };
    if (index === 2) return { bg: '#b4530925', border: '#b45309', text: '#d97706', label: '3' };
    return { bg: colors.subCardBg, border: colors.border, text: colors.textMuted, label: `${index + 1}` };
  };

  const getDifficultyColor = (diff: string) => {
    if (diff === 'Easy') return '#10b981';
    if (diff === 'Medium') return '#f59e0b';
    return '#ef4444';
  };

  const getLeetCodeMatrixSquareColor = (level: number) => {
    if (level === 3) return '#00b8a3';
    if (level === 2) return '#26a641';
    if (level === 1) return isDarkMode ? '#0e4429' : '#86efac';
    return isDarkMode ? '#161b22' : '#e2e8f0';
  };

  const formatReminderTime = (hour: number, minute: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const displayMinute = minute < 10 ? `0${minute}` : minute;
    return `${displayHour}:${displayMinute} ${period}`;
  };

  if (isSplashVisible) {
    return (
      <View style={[styles.splashFullOverlay, { backgroundColor: '#0b0f19' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />
        <Animated.View
          style={[
            styles.splashContentCenter,
            {
              opacity: splashContainerOpacity,
              transform: [{ scale: splashScale }],
            },
          ]}
        >
          <View style={styles.splashGlowHalo} />

          <Animated.Text style={[styles.splashTitle, { opacity: splashOpacity }]}>
            LEETO
          </Animated.Text>

          <Animated.View style={[styles.splashSubBadge, { opacity: splashSubOpacity }]}>
            <Text style={styles.splashSubBadgeText}>LEETCODE TEAM COMPASS</Text>
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  if (!ownerHandle) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }]}>
          <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />
          <View style={[styles.onboardingCard, { backgroundColor: colors.cardBg, borderColor: `${colors.primary}50` }]}>
            <Text style={[styles.onboardingBadge, { color: colors.primary }]}>WELCOME TO LEETO</Text>
            <Text style={[styles.onboardingTitle, { color: colors.textPrimary }]}>Link Your Profile</Text>
            <Text style={[styles.onboardingSub, { color: colors.textSecondary }]}>
              Enter your LeetCode username. Your daily streak alerts will be tied exclusively to this account.
            </Text>

            <TextInput
              style={[styles.onboardingInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.borderLight }]}
              placeholder="e.g. tour_leet"
              placeholderTextColor={colors.textMuted}
              value={onboardingInput}
              onChangeText={setOnboardingInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.onboardingBtn, { backgroundColor: colors.primary }, onboardingLoading && { opacity: 0.7 }]}
              onPress={handleOnboardingSubmit}
              disabled={onboardingLoading}
            >
              {onboardingLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.onboardingBtnText}>Start Tracking 🚀</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const groupedTodayTracks = getTodaySolvesGroupedByMember();
  const totalSolvesTodayCount = groupedTodayTracks.reduce((acc, curr) => acc + curr.todaySubmissions.length, 0);
  const ownerStats = members.find((m) => m.username.toLowerCase() === ownerHandle.toLowerCase());

  if (isTodayTrackScreenOpen) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
          <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />

          <View style={[styles.profileNavBar, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
            <TouchableOpacity
              style={[styles.navBackBtn, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => setIsTodayTrackScreenOpen(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.navBackBtnText, { color: colors.textPrimary }]}>← Back to Board</Text>
            </TouchableOpacity>

            <View style={[styles.todayCountTag, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.todayCountTagText, { color: colors.primary }]}>Today: {totalSolvesTodayCount} Solved</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profileScroll}>
            <View style={[styles.todayTrackHero, { backgroundColor: colors.cardBg, borderColor: `${colors.primary}40` }]}>
              <Text style={[styles.todayTrackHeroTitle, { color: colors.textPrimary }]}>🎯 Today's Team Activity</Text>
              <Text style={[styles.todayTrackHeroSub, { color: colors.textSecondary }]}>
                Real-time questions solved today per teammate. Automatically resets at midnight.
              </Text>
            </View>

            {groupedTodayTracks.map((person) => {
              const count = person.todaySubmissions.length;
              const isCurrentOwner = ownerHandle && person.username.toLowerCase() === ownerHandle.toLowerCase();

              return (
                <View key={person.username} style={[styles.personTrackCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <View style={styles.personTrackHeader}>
                    {person.avatar ? (
                      <Image source={{ uri: person.avatar }} style={[styles.personTrackAvatar, { borderColor: colors.primary }]} />
                    ) : (
                      <View style={[styles.personTrackAvatarFallback, { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}>
                        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '900' }}>
                          {(person.realName || person.username).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.personTrackName, { color: colors.textPrimary }]}>{person.realName || person.username}</Text>
                        {isCurrentOwner && (
                          <View style={[styles.ownerSmallBadge, { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}>
                            <Text style={[styles.ownerSmallBadgeText, { color: colors.primary }]}>You</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.personTrackHandle, { color: colors.textMuted }]}>@{person.username}</Text>
                    </View>

                    <View
                      style={[
                        styles.personSolvedCountBadge,
                        count > 0
                          ? { backgroundColor: '#10b98115', borderColor: '#10b98150' }
                          : { backgroundColor: colors.subCardBg, borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.personSolvedCountText,
                          { color: count > 0 ? '#10b981' : colors.textMuted },
                        ]}
                      >
                        {count > 0 ? `⚡ ${count} Solved` : '⏳ Pending'}
                      </Text>
                    </View>
                  </View>

                  {count > 0 ? (
                    <View style={{ marginTop: 10 }}>
                      {person.todaySubmissions.map((sub, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.personSubRow, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}
                          activeOpacity={0.75}
                          onPress={() => openProblemUrl(sub.title)}
                        >
                          <View style={styles.recentCheckIcon}>
                            <Text style={{ color: '#10b981', fontWeight: '900', fontSize: 11 }}>✓</Text>
                          </View>
                          <View style={{ flex: 1, paddingRight: 6 }}>
                            <Text style={[styles.recentTitle, { color: colors.textPrimary }]}>{sub.title}</Text>
                            <Text style={[styles.recentDate, { color: colors.textMuted }]}>Completed today • {sub.timestamp}</Text>
                          </View>
                          <View style={[styles.openBtnTag, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                            <Text style={styles.openBtnText}>Open ↗</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View style={[styles.noSubPersonBox, { backgroundColor: colors.subCardBg }]}>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>No questions solved today yet.</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (selectedMember) {
    const isCurrentOwner = ownerHandle && selectedMember.username.toLowerCase() === ownerHandle.toLowerCase();

    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
          <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />

          <View style={[styles.profileNavBar, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
            <TouchableOpacity
              style={[styles.navBackBtn, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => setSelectedMember(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.navBackBtnText, { color: colors.textPrimary }]}>← Leaderboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.externalLinkBtn, { backgroundColor: colors.primaryBg, borderColor: `${colors.primary}50` }]}
              onPress={() => openLeetCodeProfile(selectedMember.username)}
              activeOpacity={0.7}
            >
              <Text style={[styles.externalLinkBtnText, { color: colors.primary }]}>🔗 Open Profile</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profileScroll}>
            <View style={[styles.profileCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              {selectedMember.avatar ? (
                <Image
                  source={{ uri: selectedMember.avatar }}
                  style={[styles.profileAvatarImage, { borderColor: colors.primary }]}
                />
              ) : (
                <View style={[styles.profileAvatar, { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}>
                  <Text style={[styles.profileAvatarText, { color: colors.primary }]}>
                    {(selectedMember.realName || selectedMember.username).charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.profileRealName, { color: colors.textPrimary }]}>{selectedMember.realName || selectedMember.username}</Text>
              <Text style={[styles.profileHandle, { color: colors.textMuted }]}>@{selectedMember.username}</Text>

              <View style={styles.pillRow}>
                {isCurrentOwner && (
                  <View style={[styles.pillBadge, { borderColor: colors.primary, backgroundColor: colors.primaryBg }]}>
                    <Text style={[styles.pillText, { color: colors.primary }]}>You</Text>
                  </View>
                )}
                {selectedMember.streak > 0 && (
                  <View style={[styles.pillBadge, { borderColor: `${colors.primary}50`, backgroundColor: colors.primaryBg }]}>
                    <Text style={[styles.pillText, { color: colors.primary }]}>
                      🔥 {selectedMember.streak}d Streak
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={[styles.gridItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.gridVal, { color: colors.textPrimary }]}>
                  #{selectedMember.ranking ? selectedMember.ranking.toLocaleString() : 'N/A'}
                </Text>
                <Text style={[styles.gridLbl, { color: colors.textMuted }]}>Global Rank</Text>
              </View>
              <View style={[styles.gridItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.gridVal, { color: colors.textPrimary }]}>
                  {selectedMember.totalSolved}
                </Text>
                <Text style={[styles.gridLbl, { color: colors.textMuted }]}>Total Solved</Text>
              </View>
              <View style={[styles.gridItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.gridVal, { color: '#38bdf8' }]}>
                  {selectedMember.acceptanceRate > 0 ? `${selectedMember.acceptanceRate}%` : 'N/A'}
                </Text>
                <Text style={[styles.gridLbl, { color: colors.textMuted }]}>Acceptance</Text>
              </View>
            </View>

            <View style={[styles.profileSection, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Problem Solved Breakdown</Text>
              <View style={styles.difficultyContainer}>
                <View style={[styles.diffItemBox, { borderColor: '#10b98135', backgroundColor: '#10b98110' }]}>
                  <Text style={[styles.diffNumber, { color: '#10b981' }]}>{selectedMember.easySolved}</Text>
                  <Text style={[styles.diffLabel, { color: colors.textSecondary }]}>Easy</Text>
                </View>

                <View style={[styles.diffItemBox, { borderColor: '#f59e0b35', backgroundColor: '#f59e0b10' }]}>
                  <Text style={[styles.diffNumber, { color: '#f59e0b' }]}>{selectedMember.mediumSolved}</Text>
                  <Text style={[styles.diffLabel, { color: colors.textSecondary }]}>Medium</Text>
                </View>

                <View style={[styles.diffItemBox, { borderColor: '#ef444435', backgroundColor: '#ef444410' }]}>
                  <Text style={[styles.diffNumber, { color: '#ef4444' }]}>{selectedMember.hardSolved}</Text>
                  <Text style={[styles.diffLabel, { color: colors.textSecondary }]}>Hard</Text>
                </View>
              </View>
            </View>

            <View style={[styles.profileSection, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={styles.heatmapHeaderRow}>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Submissions Heatmap</Text>
                  <Text style={[styles.heatmapSubText, { color: colors.textMuted }]}>
                    {selectedMember.totalActiveDays} total active days
                  </Text>
                </View>
                {selectedDayInfo && (
                  <View style={[styles.tooltipBadge, { backgroundColor: colors.subCardBg }]}>
                    <Text style={styles.tooltipText}>
                      {selectedDayInfo.count} solves on {selectedDayInfo.date}
                    </Text>
                  </View>
                )}
              </View>

              <ScrollView
                ref={heatmapScrollRef}
                horizontal={true}
                showsHorizontalScrollIndicator={true}
                onContentSizeChange={() => heatmapScrollRef.current?.scrollToEnd({ animated: false })}
                contentContainerStyle={{ paddingRight: 24 }}
                style={[styles.matrixScroll, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}
              >
                <View style={styles.weeksRowContainer}>
                  {selectedMember.heatmapWeeks.map((week, wIdx) => (
                    <View key={wIdx} style={styles.weekColumn}>
                      <View style={styles.monthHeaderSlot}>
                        {week.monthLabel ? (
                          <Text style={[styles.monthHeaderText, { color: colors.textSecondary }]}>{week.monthLabel}</Text>
                        ) : null}
                      </View>

                      {week.days.map((day, dIdx) => (
                        <TouchableOpacity
                          key={dIdx}
                          activeOpacity={day ? 0.7 : 1}
                          onPress={() => day && setSelectedDayInfo(day)}
                          style={[
                            styles.leetCodeSquare,
                            {
                              backgroundColor: day
                                ? getLeetCodeMatrixSquareColor(day.level)
                                : 'transparent',
                              borderColor:
                                selectedDayInfo?.date === day?.date
                                  ? '#38bdf8'
                                  : day?.isToday
                                  ? colors.primary
                                  : colors.border,
                              borderWidth: day?.isToday ? 1 : 0.5,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.heatmapLegend}>
                <Text style={[styles.legendText, { color: colors.textMuted }]}>Less</Text>
                <View style={[styles.legendBox, { backgroundColor: isDarkMode ? '#161b22' : '#e2e8f0', borderColor: colors.border, borderWidth: 1 }]} />
                <View style={[styles.legendBox, { backgroundColor: isDarkMode ? '#0e4429' : '#86efac' }]} />
                <View style={[styles.legendBox, { backgroundColor: '#26a641' }]} />
                <View style={[styles.legendBox, { backgroundColor: '#00b8a3' }]} />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>More</Text>
              </View>
            </View>

            <View style={[styles.profileSection, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DSA Strengths</Text>
              <View style={styles.topicGrid}>
                {selectedMember.topTopics.map((topic, idx) => (
                  <View key={idx} style={[styles.topicBadge, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}>
                    <Text style={[styles.topicName, { color: colors.textPrimary }]}>{topic.name}</Text>
                    <Text style={[styles.topicCount, { color: colors.textMuted }]}>{topic.solved} solved</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.profileSection, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={styles.pastHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Recent Submissions</Text>
                <Text style={[styles.pastCountText, { color: colors.textMuted }]}>
                  {selectedMember.recentSubmissions.length} recent
                </Text>
              </View>

              {selectedMember.recentSubmissions.length > 0 ? (
                selectedMember.recentSubmissions.map((s, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.recentRow, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}
                    activeOpacity={0.75}
                    onPress={() => openProblemUrl(s.title)}
                  >
                    <View style={styles.recentCheckIcon}>
                      <Text style={{ color: '#10b981', fontWeight: '800', fontSize: 13 }}>✓</Text>
                    </View>
                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <Text style={[styles.recentTitle, { color: colors.textPrimary }]}>{s.title}</Text>
                      <Text style={[styles.recentDate, { color: colors.textMuted }]}>Solved on {s.timestamp}</Text>
                    </View>
                    <View style={[styles.openBtnTag, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                      <Text style={styles.openBtnText}>Open ↗</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={[styles.noSubBox, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>No recent public submissions found.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />

        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.drawerBtn, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
            onPress={() => setDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.drawerBtnIcon, { color: colors.primary }]}>☰</Text>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[
                styles.themeToggleBtn,
                { backgroundColor: colors.cardBg, borderColor: colors.border },
              ]}
              onPress={toggleTheme}
              activeOpacity={0.7}
            >
              <Text style={styles.themeToggleBtnText}>{isDarkMode ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.reminderHeaderBtn,
                { backgroundColor: colors.cardBg, borderColor: colors.border },
                reminderConfig.enabled && { borderColor: colors.primary, backgroundColor: colors.primaryBg },
              ]}
              onPress={() => setShowReminderModal(true)}
            >
              <Text style={[styles.reminderHeaderBtnText, { color: colors.textPrimary }]}>
                ⏰ {reminderConfig.enabled ? formatReminderTime(reminderConfig.hour, reminderConfig.minute) : 'Off'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}
              onPress={testSolveAlert}
            >
              <Text style={[styles.testBtnText, { color: colors.textSecondary }]}>🔔</Text>
            </TouchableOpacity>
          </View>
        </View>

        {dailyProblem && (
          <TouchableOpacity
            style={[styles.potdBanner, { backgroundColor: colors.cardBg, borderColor: `${colors.primary}30` }]}
            activeOpacity={0.88}
            onPress={() => openProblemUrl(dailyProblem.link)}
          >
            <View style={styles.potdHead}>
              <View style={styles.potdTagWrapper}>
                <Text style={styles.potdSparkle}>⚡</Text>
                <Text style={[styles.potdTag, { color: colors.primary }]}>DAILY CHALLENGE</Text>
              </View>
              <View
                style={[
                  styles.potdDiffBadge,
                  { backgroundColor: `${getDifficultyColor(dailyProblem.difficulty)}20`, borderColor: `${getDifficultyColor(dailyProblem.difficulty)}50` },
                ]}
              >
                <Text style={[styles.potdDiffText, { color: getDifficultyColor(dailyProblem.difficulty) }]}>
                  {dailyProblem.difficulty}
                </Text>
              </View>
            </View>
            <Text style={[styles.potdTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {dailyProblem.title}
            </Text>
            <View style={styles.potdFooter}>
              <View style={styles.potdTopicsRow}>
                {dailyProblem.topicTags.slice(0, 3).map((tag, idx) => (
                  <View key={idx} style={[styles.potdTopicItem, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}>
                    <Text style={[styles.potdTopicText, { color: colors.textSecondary }]}>{tag}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.potdSolveText}>Solve Now ↗</Text>
            </View>
          </TouchableOpacity>
        )}

        {members.length > 0 && (
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.cardBg, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="🔍 Search teammates by name or handle..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
          </View>
        )}

        <View style={styles.filterTabs}>
          <Text style={[styles.sortLabel, { color: colors.textMuted }]}>SORT</Text>
          <TouchableOpacity
            style={[styles.tab, { backgroundColor: colors.cardBg, borderColor: colors.border }, sortBy === 'solved' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => handleSortChange('solved')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, sortBy === 'solved' && styles.activeTabText]}>Solved</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, { backgroundColor: colors.cardBg, borderColor: colors.border }, sortBy === 'streak' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => handleSortChange('streak')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, sortBy === 'streak' && styles.activeTabText]}>🔥 Streak</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, { backgroundColor: colors.cardBg, borderColor: colors.border }, sortBy === 'acceptance' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => handleSortChange('acceptance')}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, sortBy === 'acceptance' && styles.activeTabText]}>Accuracy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.todayTrackBtn, { backgroundColor: colors.primary }]}
            onPress={() => setIsTodayTrackScreenOpen(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.todayTrackBtnText}>🎯 Today's Track</Text>
            {totalSolvesTodayCount > 0 && (
              <View style={[styles.todayTrackBadge, { backgroundColor: colors.bg }]}>
                <Text style={[styles.todayTrackBadgeText, { color: colors.primary }]}>{totalSolvesTodayCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <FlatList
          data={filteredMembers}
          keyExtractor={(item) => item.username}
          refreshing={refreshing}
          onRefresh={() => refreshTeam(members.map((m) => m.username), true, true)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>⚡</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {searchQuery ? 'No matching members found.' : 'No members on the board yet.\nTap ☰ to add teammates.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const total = item.totalSolved || 1;
            const easyP = (item.easySolved / total) * 100;
            const medP = (item.mediumSolved / total) * 100;
            const hardP = (item.hardSolved / total) * 100;
            const rankBadge = getRankBadgeDesign(index);
            const isCurrentOwner = ownerHandle && item.username.toLowerCase() === ownerHandle.toLowerCase();

            return (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  setSelectedDayInfo(null);
                  setSelectedMember(item);
                }}
                style={[
                  styles.card,
                  { backgroundColor: colors.cardBg, borderColor: colors.border },
                  index === 0 && { borderColor: '#eab30850' },
                ]}
              >
                <View style={styles.cardHead}>
                  <View style={styles.rankInfo}>
                    <View style={[styles.podiumBadge, { backgroundColor: rankBadge.bg, borderColor: rankBadge.border }]}>
                      <Text style={[styles.podiumText, { color: rankBadge.text }]}>{rankBadge.label}</Text>
                    </View>

                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={styles.cardAvatarImage} />
                    ) : (
                      <View style={[styles.cardAvatarFallback, { backgroundColor: colors.subCardBg, borderColor: colors.borderLight }]}>
                        <Text style={[styles.cardAvatarText, { color: colors.textSecondary }]}>
                          {(item.realName || item.username).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[styles.cardName, { color: colors.textPrimary }]}>{item.realName || item.username}</Text>

                        {isCurrentOwner && (
                          <View style={[styles.ownerBadge, { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}>
                            <Text style={[styles.ownerBadgeText, { color: colors.primary }]}>You</Text>
                          </View>
                        )}

                        {item.streak > 0 && (
                          <View style={[styles.streakBadge, { backgroundColor: colors.primaryBg, borderColor: `${colors.primary}50` }]}>
                            <Text style={[styles.streakText, { color: colors.primary }]}>🔥 {item.streak}d</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.cardHandle, { color: colors.textMuted }]}>@{item.username}</Text>
                    </View>
                  </View>
                  {!isCurrentOwner && (
                    <TouchableOpacity onPress={() => removeMember(item.username)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={[styles.delText, { color: colors.textMuted }]}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={[styles.bar, { backgroundColor: colors.subCardBg }]}>
                  <View style={[styles.seg, { width: `${easyP}%`, backgroundColor: '#10b981' }]} />
                  <View style={[styles.seg, { width: `${medP}%`, backgroundColor: '#f59e0b' }]} />
                  <View style={[styles.seg, { width: `${hardP}%`, backgroundColor: '#ef4444' }]} />
                </View>

                <View style={styles.statsFlex}>
                  <View style={styles.totalBox}>
                    <Text style={[styles.totalText, { color: colors.textPrimary }]}>{item.totalSolved}</Text>
                    <Text style={[styles.subLabel, { color: colors.textMuted }]}>Solved</Text>
                  </View>

                  <View style={styles.badges}>
                    <View style={[styles.badgeItem, { backgroundColor: '#10b98115', borderColor: '#10b98135' }]}>
                      <Text style={[styles.badgeVal, { color: '#10b981' }]}>{item.easySolved}</Text>
                      <Text style={[styles.badgeDiff, { color: colors.textSecondary }]}>Easy</Text>
                    </View>
                    <View style={[styles.badgeItem, { backgroundColor: '#f59e0b15', borderColor: '#f59e0b35' }]}>
                      <Text style={[styles.badgeVal, { color: '#f59e0b' }]}>{item.mediumSolved}</Text>
                      <Text style={[styles.badgeDiff, { color: colors.textSecondary }]}>Med</Text>
                    </View>
                    <View style={[styles.badgeItem, { backgroundColor: '#ef444415', borderColor: '#ef444435' }]}>
                      <Text style={[styles.badgeVal, { color: '#ef4444' }]}>{item.hardSolved}</Text>
                      <Text style={[styles.badgeDiff, { color: colors.textSecondary }]}>Hard</Text>
                    </View>

                    <View
                      style={[
                        styles.badgeItem,
                        item.solvedDailyToday
                          ? { backgroundColor: '#10b98115', borderColor: '#10b98150' }
                          : { backgroundColor: colors.subCardBg, borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeVal,
                          { color: item.solvedDailyToday ? '#10b981' : colors.textMuted },
                        ]}
                      >
                        {item.solvedDailyToday ? '✓' : '⏳'}
                      </Text>
                      <Text
                        style={[
                          styles.badgeDiff,
                          { color: item.solvedDailyToday ? '#10b981' : colors.textMuted, fontWeight: '800' },
                        ]}
                      >
                        POTD
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        {/* Option Drawer Sheet */}
        <Modal
          visible={drawerOpen}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setDrawerOpen(false)}
        >
          <View style={styles.modalShade}>
            <View style={[styles.sheet, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={styles.modalHead}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Menu & Options</Text>
                <TouchableOpacity onPress={() => setDrawerOpen(false)} style={[styles.sheetClose, { backgroundColor: colors.subCardBg }]}>
                  <Text style={[styles.sheetCloseText, { color: colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* View Profile Option */}
              {ownerStats && (
                <TouchableOpacity
                  style={[styles.drawerProfileBtn, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}
                  onPress={() => {
                    setDrawerOpen(false);
                    setSelectedDayInfo(null);
                    setSelectedMember(ownerStats);
                  }}
                >
                  {ownerStats.avatar ? (
                    <Image source={{ uri: ownerStats.avatar }} style={styles.drawerAvatar} />
                  ) : (
                    <View style={[styles.drawerAvatarFallback, { backgroundColor: colors.primaryBg }]}>
                      <Text style={{ color: colors.primary, fontWeight: '900' }}>
                        {(ownerStats.realName || ownerStats.username).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.drawerProfileName, { color: colors.textPrimary }]}>
                      {ownerStats.realName || ownerStats.username}
                    </Text>
                    <Text style={[styles.drawerProfileHandle, { color: colors.textMuted }]}>
                      @{ownerStats.username} (You)
                    </Text>
                  </View>
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>View Profile →</Text>
                </TouchableOpacity>
              )}

              {/* Add Teammate Option */}
              <Text style={[styles.sheetSub, { color: colors.textPrimary, marginTop: 16, marginBottom: 8 }]}>
                Add Teammate
              </Text>
              <View style={styles.drawerAddRow}>
                <TextInput
                  style={[styles.drawerInput, { backgroundColor: colors.subCardBg, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="LeetCode username..."
                  placeholderTextColor={colors.textMuted}
                  value={drawerAddInput}
                  onChangeText={setDrawerAddInput}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.drawerAddBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
                  onPress={handleAddTeammate}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.drawerAddBtnText}>+ Add</Text>}
                </TouchableOpacity>
              </View>

              {/* Push Token Diagnostic Row */}
              {pushToken && (
                <TouchableOpacity
                  style={[styles.pushTokenBox, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}
                  onPress={() => Alert.alert('Your Expo Push Token', pushToken)}
                >
                  <Text style={[styles.pushTokenLabel, { color: colors.textMuted }]}>Device Push Token (Tap to View)</Text>
                  <Text style={[styles.pushTokenVal, { color: colors.textSecondary }]} numberOfLines={1}>
                    {pushToken}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Sign Out Button */}
              <TouchableOpacity
                style={styles.signOutBtn}
                onPress={handleSignOut}
                activeOpacity={0.7}
              >
                <Text style={styles.signOutBtnText}>🚪 Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Custom Daily Streak Shield Reminder Modal */}
        <Modal
          visible={showReminderModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowReminderModal(false)}
        >
          <View style={styles.modalShade}>
            <View style={[styles.sheet, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={styles.modalHead}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Daily Streak Shield</Text>
                <TouchableOpacity onPress={() => setShowReminderModal(false)} style={[styles.sheetClose, { backgroundColor: colors.subCardBg }]}>
                  <Text style={[styles.sheetCloseText, { color: colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 14, lineHeight: 18 }}>
                Monitors <Text style={{ color: colors.primary, fontWeight: '800' }}>@{ownerHandle}</Text>. Alerts trigger only if your daily problem is unsolved.
              </Text>

              <View style={[styles.toggleRow, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}>
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Enable Daily Reminder</Text>
                <Switch
                  value={reminderConfig.enabled}
                  onValueChange={(val) => saveReminderSettings({ ...reminderConfig, enabled: val })}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              <Text style={[styles.sheetSub, { color: colors.textPrimary, marginTop: 14, marginBottom: 8 }]}>Custom Time</Text>
              <View style={[styles.customTimePickerRow, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}>
                <View style={styles.timeInputContainer}>
                  <TextInput
                    style={[styles.timeDigitInput, { backgroundColor: colors.cardBg, color: colors.textPrimary, borderColor: colors.borderLight }]}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={customHour}
                    onChangeText={setCustomHour}
                    placeholder="08"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={[styles.timeInputSub, { color: colors.textMuted }]}>Hour (1-12)</Text>
                </View>

                <Text style={[styles.timeColon, { color: colors.primary }]}>:</Text>

                <View style={styles.timeInputContainer}>
                  <TextInput
                    style={[styles.timeDigitInput, { backgroundColor: colors.cardBg, color: colors.textPrimary, borderColor: colors.borderLight }]}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={customMinute}
                    onChangeText={setCustomMinute}
                    placeholder="00"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={[styles.timeInputSub, { color: colors.textMuted }]}>Min (00-59)</Text>
                </View>

                <View style={styles.amPmContainer}>
                  <TouchableOpacity
                    style={[styles.amPmBtn, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }, !isPM && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setIsPM(false)}
                  >
                    <Text style={[styles.amPmText, { color: !isPM ? '#fff' : colors.textSecondary }]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.amPmBtn, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }, isPM && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setIsPM(true)}
                  >
                    <Text style={[styles.amPmText, { color: isPM ? '#fff' : colors.textSecondary }]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.sheetSub, { color: colors.textPrimary, marginTop: 14, marginBottom: 8 }]}>Presets</Text>
              <View style={styles.timeSlotRow}>
                {[
                  { label: '6:00 PM', h: '06', m: '00', pm: true },
                  { label: '8:00 PM', h: '08', m: '00', pm: true },
                  { label: '9:30 PM', h: '09', m: '30', pm: true },
                  { label: '11:00 PM', h: '11', m: '00', pm: true },
                ].map((slot, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.timeSlotBtn, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}
                    onPress={() => {
                      setCustomHour(slot.h);
                      setCustomMinute(slot.m);
                      setIsPM(slot.pm);
                    }}
                  >
                    <Text style={[styles.timeSlotText, { color: colors.textSecondary }]}>{slot.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.actionMainBtn, { backgroundColor: colors.primary }]}
                onPress={handleApplyCustomTime}
              >
                <Text style={styles.actionMainBtnText}>Save Custom Reminder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  splashFullOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  splashContentCenter: { alignItems: 'center', justifyContent: 'center' },
  splashGlowHalo: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: '#f9731618' },
  splashTitle: { fontSize: 48, fontWeight: '900', color: '#f97316', letterSpacing: 4 },
  splashSubBadge: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: '#f9731615', borderWidth: 1, borderColor: '#f9731640' },
  splashSubBadgeText: { color: '#f97316', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drawerBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  drawerBtnIcon: { fontSize: 16, fontWeight: '900' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  themeToggleBtn: { borderWidth: 1, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 10 },
  themeToggleBtnText: { fontSize: 13, fontWeight: '700' },
  reminderHeaderBtn: { borderWidth: 1, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 10 },
  reminderHeaderBtnText: { fontSize: 11, fontWeight: '700' },
  testBtn: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1 },
  testBtnText: { fontSize: 12, fontWeight: '700' },
  todayCountTag: { borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
  todayCountTagText: { fontSize: 11, fontWeight: '800' },

  potdBanner: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  potdHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  potdTagWrapper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  potdSparkle: { fontSize: 11 },
  potdTag: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  potdDiffBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  potdDiffText: { fontSize: 10, fontWeight: '800' },
  potdTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  potdFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  potdTopicsRow: { flexDirection: 'row', gap: 5 },
  potdTopicItem: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  potdTopicText: { fontSize: 10, fontWeight: '600' },
  potdSolveText: { color: '#38bdf8', fontSize: 11, fontWeight: '700' },
  searchRow: { paddingHorizontal: 16, marginBottom: 10 },
  searchInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, fontSize: 12, borderWidth: 1 },

  filterTabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12, gap: 5 },
  sortLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  tab: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1 },
  tabText: { fontSize: 11, fontWeight: '700' },
  activeTabText: { color: '#fff' },
  todayTrackBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, gap: 4, marginLeft: 'auto' },
  todayTrackBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  todayTrackBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 10 },
  todayTrackBadgeText: { fontSize: 10, fontWeight: '900' },

  card: { borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rankInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  podiumBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  podiumText: { fontSize: 13, fontWeight: '900' },
  cardAvatarImage: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#38bdf8' },
  cardAvatarFallback: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardAvatarText: { fontSize: 13, fontWeight: '800' },
  cardName: { fontSize: 15, fontWeight: '800' },
  cardHandle: { fontSize: 11, marginTop: 1 },
  ownerBadge: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  ownerBadgeText: { fontSize: 9, fontWeight: '800' },
  ownerSmallBadge: { borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  ownerSmallBadgeText: { fontSize: 8, fontWeight: '800' },
  streakBadge: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  streakText: { fontSize: 9, fontWeight: '800' },
  delText: { fontSize: 14, padding: 4 },
  bar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 12 },
  seg: { height: '100%' },
  statsFlex: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalBox: { alignItems: 'flex-start' },
  totalText: { fontSize: 20, fontWeight: '900' },
  subLabel: { fontSize: 9, textTransform: 'uppercase', fontWeight: '700' },
  badges: { flexDirection: 'row', gap: 5 },
  badgeItem: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', minWidth: 42, borderWidth: 1 },
  badgeVal: { fontSize: 12, fontWeight: '800' },
  badgeDiff: { fontSize: 9, marginTop: 1, fontWeight: '600' },
  emptyState: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  onboardingCard: { padding: 24, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  onboardingBadge: { fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  onboardingTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  onboardingSub: { fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  onboardingInput: { width: '100%', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, borderWidth: 1, marginBottom: 16 },
  onboardingBtn: { width: '100%', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  onboardingBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },

  drawerProfileBtn: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, gap: 10, marginBottom: 8 },
  drawerAvatar: { width: 40, height: 40, borderRadius: 20 },
  drawerAvatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  drawerProfileName: { fontSize: 15, fontWeight: '800' },
  drawerProfileHandle: { fontSize: 11, marginTop: 1 },
  drawerAddRow: { flexDirection: 'row', gap: 8 },
  drawerInput: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, borderWidth: 1 },
  drawerAddBtn: { borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  drawerAddBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  pushTokenBox: { marginTop: 14, padding: 10, borderRadius: 10, borderWidth: 1 },
  pushTokenLabel: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  pushTokenVal: { fontSize: 11, fontWeight: '600' },
  signOutBtn: { marginTop: 18, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#ef444415', borderWidth: 1, borderColor: '#ef444450' },
  signOutBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '800' },

  profileNavBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  navBackBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  navBackBtnText: { fontSize: 13, fontWeight: '800' },
  externalLinkBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  externalLinkBtnText: { fontSize: 12, fontWeight: '800' },
  profileScroll: { padding: 16, paddingBottom: 40 },
  profileCard: { padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 14, borderWidth: 1 },
  profileAvatarImage: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, marginBottom: 10 },
  profileAvatar: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  profileAvatarText: { fontSize: 26, fontWeight: '900' },
  profileRealName: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  profileHandle: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  pillBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: '700' },
  profileSection: { padding: 16, borderRadius: 18, marginBottom: 14, borderWidth: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  todayTrackHero: { padding: 16, borderRadius: 16, marginBottom: 14, borderWidth: 1 },
  todayTrackHeroTitle: { fontSize: 18, fontWeight: '900' },
  todayTrackHeroSub: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  personTrackCard: { borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1 },
  personTrackHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personTrackAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5 },
  personTrackAvatarFallback: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  personTrackName: { fontSize: 15, fontWeight: '800' },
  personTrackHandle: { fontSize: 11, marginTop: 1 },
  personSolvedCountBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1 },
  personSolvedCountText: { fontSize: 11, fontWeight: '800' },
  personSubRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 1 },
  noSubPersonBox: { padding: 10, borderRadius: 10, marginTop: 8, alignItems: 'center' },

  difficultyContainer: { flexDirection: 'row', gap: 8, marginTop: 12 },
  diffItemBox: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  diffNumber: { fontSize: 18, fontWeight: '900' },
  diffLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },

  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  gridItem: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  gridVal: { fontSize: 15, fontWeight: '900' },
  gridLbl: { fontSize: 9, marginTop: 3, textTransform: 'uppercase', fontWeight: '700' },

  heatmapHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heatmapSubText: { fontSize: 10, marginTop: 2 },
  tooltipBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#38bdf8' },
  tooltipText: { color: '#38bdf8', fontSize: 10, fontWeight: '700' },
  matrixScroll: { borderRadius: 12, padding: 10, borderWidth: 1 },
  weeksRowContainer: { flexDirection: 'row', gap: 3 },
  weekColumn: { alignItems: 'center', gap: 3 },
  monthHeaderSlot: { height: 16, justifyContent: 'center' },
  monthHeaderText: { fontSize: 9, fontWeight: '800' },
  leetCodeSquare: { width: 14, height: 14, borderRadius: 2.5, borderWidth: 0.5 },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 10 },
  legendBox: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 10, marginHorizontal: 2 },

  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  topicBadge: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  topicName: { fontSize: 11, fontWeight: '700' },
  topicCount: { fontSize: 9, marginTop: 1, fontWeight: '600' },
  pastHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pastCountText: { fontSize: 11, fontWeight: '600' },
  recentRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1 },
  recentCheckIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#10b98115', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  recentTitle: { fontSize: 13, fontWeight: '700' },
  recentDate: { fontSize: 10, marginTop: 2 },
  openBtnTag: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1 },
  openBtnText: { color: '#38bdf8', fontSize: 11, fontWeight: '800' },
  noSubBox: { padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },

  modalShade: { flex: 1, backgroundColor: 'rgba(5,8,16,0.85)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%', borderWidth: 1 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  sheetClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 13, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '700' },
  sheetSub: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  customTimePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 14, borderWidth: 1, gap: 10 },
  timeInputContainer: { alignItems: 'center' },
  timeDigitInput: { fontSize: 22, fontWeight: '900', textAlign: 'center', width: 62, height: 50, borderRadius: 10, borderWidth: 1 },
  timeInputSub: { fontSize: 9, marginTop: 4, fontWeight: '600' },
  timeColon: { fontSize: 24, fontWeight: '900', marginBottom: 12 },
  amPmContainer: { flexDirection: 'column', gap: 4, marginLeft: 6 },
  amPmBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1 },
  amPmText: { fontSize: 11, fontWeight: '800' },

  timeSlotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeSlotBtn: { flex: 1, minWidth: '45%', paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1 },
  timeSlotText: { fontSize: 11, fontWeight: '700' },
  actionMainBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  actionMainBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});