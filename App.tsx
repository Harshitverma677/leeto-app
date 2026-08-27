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

const JSONBIN_BIN_ID = '6a8adce9da38895dfe06ade0';
const JSONBIN_API_KEY = '$2a$10$q/z2mZGd58JtaJVXLOGB0OUhQHg9cSRyh98eCwHMfPeEF2vN5DXhe';

type SortKey = 'solved' | 'streak' | 'acceptance';

interface ReminderSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

interface SubscriptionEntry {
  token: string;
  tracking: string[];
}

interface DayOption {
  label: string;
  subLabel: string;
  dateStr: string;
  startTimestampUtc: number;
  endTimestampUtc: number;
}

const darkColors = {
  bg: '#05070d',
  cardBg: '#0f172a',
  subCardBg: '#1e293b50',
  inputBg: '#0b1120',
  border: '#1e293b',
  borderLight: '#334155',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  primary: '#ff9900',
  primaryBg: '#ff990020',
  primaryBorder: '#ff990060',
  cyan: '#00f2fe',
  cyanBg: '#00f2fe18',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#f43f5e',
  statusBar: 'light-content' as const,
};

const lightColors = {
  bg: '#f8fafc',
  cardBg: '#ffffff',
  subCardBg: '#f1f5f9',
  inputBg: '#f8fafc',
  border: '#e2e8f0',
  borderLight: '#cbd5e1',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  primary: '#ea580c',
  primaryBg: '#ea580c15',
  primaryBorder: '#ea580c50',
  cyan: '#0284c7',
  cyanBg: '#0284c715',
  green: '#059669',
  yellow: '#d97706',
  red: '#e11d48',
  statusBar: 'dark-content' as const,
};

const getPast7UtcDays = (): DayOption[] => {
  const days: DayOption[] = [];
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 0, 0, 0));
    const startTimestampUtc = Math.floor(d.getTime() / 1000);
    const endTimestampUtc = startTimestampUtc + 86399;

    let label = `${dayNames[d.getUTCDay()]}`;
    if (i === 0) label = 'Today';
    if (i === 1) label = 'Yesterday';

    const subLabel = `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}`;
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    days.push({
      label,
      subLabel,
      dateStr,
      startTimestampUtc,
      endTimestampUtc,
    });
  }

  return days;
};

const getUtcDateString = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
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
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);

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
  const lastReminderTriggeredUtcDate = useRef<string>('');
  const membersRef = useRef<LeetCodeStats[]>([]);
  const ownerHandleRef = useRef<string | null>(null);
  const dailyProblemRef = useRef<DailyChallenge | null>(null);
  const reminderConfigRef = useRef<ReminderSettings>(reminderConfig);
  const sortByRef = useRef<SortKey>(sortBy);

  const past7Days = getPast7UtcDays();

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

  const syncCloudTracking = async (membersList: string[], tokenToUse?: string | null) => {
    let targetToken = tokenToUse !== undefined ? tokenToUse : pushToken;

    if (!targetToken) {
      targetToken = await getDevicePushToken();
      if (targetToken) {
        setPushToken(targetToken);
      }
    }

    if (!targetToken) return;

    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
        method: 'GET',
        headers: { 'X-Master-Key': JSONBIN_API_KEY },
      });

      if (!res.ok) return;

      const currentData = await res.json();
      let subscriptions: SubscriptionEntry[] = currentData.record?.subscriptions || [];

      if (!Array.isArray(subscriptions)) {
        subscriptions = [];
      }

      const cleanMembers = Array.from(new Set(membersList.map((m) => m.trim()).filter(Boolean)));
      const existingSubIndex = subscriptions.findIndex((sub) => sub.token === targetToken);

      if (existingSubIndex >= 0) {
        subscriptions[existingSubIndex].tracking = cleanMembers;
      } else {
        subscriptions.push({
          token: targetToken,
          tracking: cleanMembers,
        });
      }

      await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': JSONBIN_API_KEY,
        },
        body: JSON.stringify({ subscriptions }),
      });
    } catch (_) {}
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
      await requestNotificationPermissions();
      const token = await getDevicePushToken();
      if (token) {
        setPushToken(token);
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
      const parsedList: string[] = saved ? JSON.parse(saved) : (savedOwner ? [savedOwner] : []);

      if (saved) {
        await refreshTeam(parsedList, false, false, potd?.title);
      }

      if (token) {
        await syncCloudTracking(parsedList, token);
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

      const token = pushToken || (await getDevicePushToken());
      if (token) {
        setPushToken(token);
        syncCloudTracking(list, token);
      }
    }
  };

  const checkDailyReminder = () => {
    const config = reminderConfigRef.current;
    if (!config.enabled) return;

    const currentOwner = ownerHandleRef.current;
    if (!currentOwner) return;

    const now = new Date();
    const todayUtcDateStr = getUtcDateString();

    if (
      lastReminderTriggeredUtcDate.current !== todayUtcDateStr &&
      now.getHours() === config.hour &&
      now.getMinutes() >= config.minute
    ) {
      const ownerMember = membersRef.current.find(
        (m) => m.username.toLowerCase() === currentOwner.toLowerCase()
      );

      if (ownerMember && !ownerMember.solvedDailyToday && dailyProblemRef.current) {
        lastReminderTriggeredUtcDate.current = todayUtcDateStr;
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

            await triggerLocalSolveNotification(
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

  const getSubmissionsForDay = (day: DayOption) => {
    return members.map((member) => {
      const filteredSubmissions = (member.recentSubmissions || []).filter((sub) => {
        if (!sub.rawTimestamp || sub.rawTimestamp === 0) return false;
        return (
          sub.rawTimestamp >= day.startTimestampUtc &&
          sub.rawTimestamp <= day.endTimestampUtc
        );
      });

      return {
        ...member,
        filteredSubmissions,
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
    if (index === 0) return { bg: '#ff990025', border: '#ff9900', text: '#ff9900', label: '1 👑' };
    if (index === 1) return { bg: isDarkMode ? '#00f2fe20' : '#e2e8f0', border: '#00f2fe', text: isDarkMode ? '#00f2fe' : '#0284c7', label: '2' };
    if (index === 2) return { bg: '#8b5cf625', border: '#8b5cf6', text: '#a78bfa', label: '3' };
    return { bg: colors.subCardBg, border: colors.border, text: colors.textMuted, label: `${index + 1}` };
  };

  const getDifficultyMeta = (diff?: string) => {
    if (diff === 'Easy') return { letter: 'E', color: colors.green };
    if (diff === 'Hard') return { letter: 'H', color: colors.red };
    return { letter: 'M', color: colors.yellow };
  };

  const getLeetCodeMatrixSquareColor = (level: number) => {
    if (level === 3) return '#00f2fe';
    if (level === 2) return '#10b981';
    if (level === 1) return isDarkMode ? '#064e3b' : '#a7f3d0';
    return isDarkMode ? '#1e293b' : '#e2e8f0';
  };

  const formatReminderTime = (hour: number, minute: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const displayMinute = minute < 10 ? `0${minute}` : minute;
    return `${displayHour}:${displayMinute} ${period}`;
  };

  if (isSplashVisible) {
    return (
      <View style={[styles.splashFullOverlay, { backgroundColor: '#05070d' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#05070d" />
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
          <View style={styles.splashBadgeIcon}>
            <Text style={{ fontSize: 34 }}>⚡</Text>
          </View>
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
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg, justifyContent: 'center', padding: 20 }]}>
          <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />
          <View style={[styles.onboardingCard, { backgroundColor: colors.cardBg, borderColor: colors.primaryBorder }]}>
            <View style={[styles.onboardingIconRing, { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}>
              <Text style={{ fontSize: 30 }}>🔥</Text>
            </View>
            <Text style={[styles.onboardingBadge, { color: colors.primary }]}>GET STARTED</Text>
            <Text style={[styles.onboardingTitle, { color: colors.textPrimary }]}>Connect Your Handle</Text>
            <Text style={[styles.onboardingSub, { color: colors.textSecondary }]}>
              Link your LeetCode profile to monitor team rankings and receive automated streak shields.
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
                <Text style={styles.onboardingBtnText}>Start Tracking ⚡</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const activeDay = past7Days[selectedDayIndex] || past7Days[0];
  const todayDayOption = past7Days[0];
  const todaySolvesMembers = getSubmissionsForDay(todayDayOption);
  const totalSolvesTodayCount = todaySolvesMembers.reduce((acc, curr) => acc + curr.filteredSubmissions.length, 0);

  const selectedDayTracks = getSubmissionsForDay(activeDay);
  const totalSelectedDayCount = selectedDayTracks.reduce((acc, curr) => acc + curr.filteredSubmissions.length, 0);

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
              <Text style={[styles.navBackBtnText, { color: colors.textPrimary }]}>← Back</Text>
            </TouchableOpacity>

            <View style={[styles.todayCountTag, { backgroundColor: colors.primaryBg, borderColor: colors.primaryBorder }]}>
              <Text style={[styles.todayCountTagText, { color: colors.primary }]}>
                ⚡ {totalSelectedDayCount} Solved ({activeDay.label})
              </Text>
            </View>
          </View>

          {/* 7-Day Day Selector Carousel */}
          <View style={{ marginTop: 12, marginBottom: 12 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayPickerScroll}
            >
              {past7Days.map((day, idx) => {
                const isSelected = selectedDayIndex === idx;
                const daySolves = getSubmissionsForDay(day);
                const daySolveTotal = daySolves.reduce((acc, curr) => acc + curr.filteredSubmissions.length, 0);

                return (
                  <TouchableOpacity
                    key={day.dateStr}
                    style={[
                      styles.dayPickerCard,
                      { backgroundColor: colors.cardBg, borderColor: colors.border },
                      isSelected && {
                        backgroundColor: colors.primaryBg,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => setSelectedDayIndex(idx)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.dayPickerLabel,
                        { color: colors.textSecondary },
                        isSelected && { color: colors.primary, fontWeight: '900' },
                      ]}
                    >
                      {day.label}
                    </Text>
                    <Text
                      style={[
                        styles.dayPickerSubLabel,
                        { color: colors.textMuted },
                        isSelected && { color: colors.textPrimary },
                      ]}
                    >
                      {day.subLabel}
                    </Text>
                    <View
                      style={[
                        styles.dayPickerCountBadge,
                        daySolveTotal > 0
                          ? { backgroundColor: `${colors.green}20`, borderColor: colors.green }
                          : { backgroundColor: colors.subCardBg, borderColor: colors.border },
                        isSelected && daySolveTotal > 0 && { backgroundColor: colors.green },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayPickerCountText,
                          { color: daySolveTotal > 0 ? colors.green : colors.textMuted },
                          isSelected && daySolveTotal > 0 && { color: '#fff' },
                        ]}
                      >
                        {daySolveTotal > 0 ? `⚡ ${daySolveTotal}` : '0'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profileScroll}>
            {selectedDayTracks.map((person) => {
              const count = person.filteredSubmissions.length;
              const isCurrentOwner = ownerHandle && person.username.toLowerCase() === ownerHandle.toLowerCase();

              return (
                <View key={person.username} style={[styles.personTrackCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <View style={styles.personTrackHeader}>
                    {person.avatar ? (
                      <Image source={{ uri: person.avatar }} style={[styles.personTrackAvatar, { borderColor: colors.cyan }]} />
                    ) : (
                      <View style={[styles.personTrackAvatarFallback, { backgroundColor: colors.cyanBg, borderColor: colors.cyan }]}>
                        <Text style={{ color: colors.cyan, fontSize: 13, fontWeight: '900' }}>
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
                          ? { backgroundColor: '#10b98120', borderColor: '#10b981' }
                          : { backgroundColor: colors.subCardBg, borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.personSolvedCountText,
                          { color: count > 0 ? '#10b981' : colors.textMuted },
                        ]}
                      >
                        {count > 0 ? `⚡ ${count} Solved` : '0 Solves'}
                      </Text>
                    </View>
                  </View>

                  {count > 0 ? (
                    <View style={{ marginTop: 12 }}>
                      {person.filteredSubmissions.map((sub, idx) => {
                        const diffMeta = getDifficultyMeta(sub.difficulty);

                        return (
                          <View
                            key={idx}
                            style={[styles.personSubRow, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}
                          >
                            <View style={styles.recentCheckIcon}>
                              <Text style={{ color: colors.green, fontWeight: '900', fontSize: 11 }}>✓</Text>
                            </View>

                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <View style={styles.inlineQuestionRow}>
                                <View style={[styles.compactDiffBadge, { backgroundColor: `${diffMeta.color}20`, borderColor: `${diffMeta.color}60` }]}>
                                  <Text style={[styles.compactDiffText, { color: diffMeta.color }]}>{diffMeta.letter}</Text>
                                </View>
                                <Text style={[styles.recentTitle, { color: colors.textPrimary }]}>
                                  {sub.title}
                                </Text>
                              </View>
                              <Text style={[styles.recentDate, { color: colors.textMuted }]}>Solved • {sub.timestamp}</Text>
                            </View>

                            <TouchableOpacity
                              style={[styles.openBtnTag, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                              onPress={() => openProblemUrl(sub.title)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.openBtnText, { color: colors.cyan }]}>Open ↗</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={[styles.noSubPersonBox, { backgroundColor: colors.subCardBg }]}>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        No questions completed on this day.
                      </Text>
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
              <Text style={[styles.navBackBtnText, { color: colors.textPrimary }]}>← Board</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.externalLinkBtn, { backgroundColor: colors.primaryBg, borderColor: colors.primaryBorder }]}
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
                    <Text style={[styles.pillText, { color: colors.primary }]}>Primary Account</Text>
                  </View>
                )}
                {selectedMember.streak > 0 && (
                  <View style={[styles.pillBadge, { borderColor: colors.primaryBorder, backgroundColor: colors.primaryBg }]}>
                    <Text style={[styles.pillText, { color: colors.primary }]}>
                      🔥 {selectedMember.streak}d Streak
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={[styles.gridItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.gridVal, { color: colors.cyan }]}>
                  {selectedMember.contestRating > 0 ? selectedMember.contestRating : 'N/A'}
                </Text>
                <Text style={[styles.gridLbl, { color: colors.textMuted }]}>Contest Rating</Text>
              </View>
              <View style={[styles.gridItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.gridVal, { color: colors.primary }]}>
                  {selectedMember.totalSolved}
                </Text>
                <Text style={[styles.gridLbl, { color: colors.textMuted }]}>Total Solved</Text>
              </View>
              <View style={[styles.gridItem, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.gridVal, { color: colors.green }]}>
                  {selectedMember.acceptanceRate > 0 ? `${selectedMember.acceptanceRate}%` : 'N/A'}
                </Text>
                <Text style={[styles.gridLbl, { color: colors.textMuted }]}>Accuracy</Text>
              </View>
            </View>

            <View style={[styles.profileSection, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Problem Solved Breakdown</Text>
              <View style={styles.difficultyContainer}>
                <View style={[styles.diffItemBox, { borderColor: `${colors.green}40`, backgroundColor: `${colors.green}15` }]}>
                  <Text style={[styles.diffNumber, { color: colors.green }]}>{selectedMember.easySolved}</Text>
                  <Text style={[styles.diffLabel, { color: colors.textSecondary }]}>Easy</Text>
                </View>

                <View style={[styles.diffItemBox, { borderColor: `${colors.yellow}40`, backgroundColor: `${colors.yellow}15` }]}>
                  <Text style={[styles.diffNumber, { color: colors.yellow }]}>{selectedMember.mediumSolved}</Text>
                  <Text style={[styles.diffLabel, { color: colors.textSecondary }]}>Medium</Text>
                </View>

                <View style={[styles.diffItemBox, { borderColor: `${colors.red}40`, backgroundColor: `${colors.red}15` }]}>
                  <Text style={[styles.diffNumber, { color: colors.red }]}>{selectedMember.hardSolved}</Text>
                  <Text style={[styles.diffLabel, { color: colors.textSecondary }]}>Hard</Text>
                </View>
              </View>
            </View>

            {/* LeetCode Month-Separated Heatmap */}
            <View style={[styles.profileSection, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={styles.heatmapHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Submissions Heatmap</Text>
                {selectedDayInfo && (
                  <View style={[styles.tooltipBadge, { backgroundColor: colors.subCardBg, borderColor: colors.cyan }]}>
                    <Text style={[styles.tooltipText, { color: colors.cyan }]}>
                      {selectedDayInfo.count} solves on {selectedDayInfo.date}
                    </Text>
                  </View>
                )}
              </View>

              <ScrollView
                ref={heatmapScrollRef}
                horizontal={true}
                showsHorizontalScrollIndicator={true}
                indicatorStyle={isDarkMode ? 'white' : 'black'}
                onContentSizeChange={() => heatmapScrollRef.current?.scrollToEnd({ animated: false })}
                contentContainerStyle={{ paddingRight: 20 }}
                style={[styles.matrixScroll, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}
              >
                <View style={styles.monthsContainerRow}>
                  {(selectedMember.heatmapMonthGroups || []).map((monthGroup, mIdx) => (
                    <View key={mIdx} style={styles.monthBlock}>
                      <Text style={[styles.monthBlockLabel, { color: colors.textMuted }]}>
                        {monthGroup.monthName}
                      </Text>

                      <View style={styles.monthWeeksRow}>
                        {monthGroup.weeks.map((week, wIdx) => (
                          <View key={wIdx} style={styles.weekColumn}>
                            {week.days.map((day, dIdx) => (
                              <TouchableOpacity
                                key={day?.date || dIdx}
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
                                        ? colors.cyan
                                        : day?.isToday
                                        ? colors.primary
                                        : day ? colors.border : 'transparent',
                                    borderWidth: day?.isToday ? 1.5 : day ? 0.5 : 0,
                                  },
                                ]}
                              />
                            ))}
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.heatmapLegend}>
                <Text style={[styles.legendText, { color: colors.textMuted }]}>Less</Text>
                <View style={[styles.legendBox, { backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0', borderColor: colors.border, borderWidth: 1 }]} />
                <View style={[styles.legendBox, { backgroundColor: isDarkMode ? '#064e3b' : '#a7f3d0' }]} />
                <View style={[styles.legendBox, { backgroundColor: '#10b981' }]} />
                <View style={[styles.legendBox, { backgroundColor: '#00f2fe' }]} />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>More</Text>
              </View>
            </View>

            <View style={[styles.profileSection, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DSA Focus Areas</Text>
              <View style={styles.topicGrid}>
                {selectedMember.topTopics.map((topic, idx) => (
                  <View key={idx} style={[styles.topicBadge, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}>
                    <Text style={[styles.topicName, { color: colors.textPrimary }]}>{topic.name}</Text>
                    <Text style={[styles.topicCount, { color: colors.cyan }]}>{topic.solved} solved</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.profileSection, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={styles.pastHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Recent Submissions</Text>
                <Text style={[styles.pastCountText, { color: colors.textMuted }]}>
                  {selectedMember.recentSubmissions.length} public solves
                </Text>
              </View>

              {selectedMember.recentSubmissions.length > 0 ? (
                selectedMember.recentSubmissions.map((s, idx) => (
                  <View
                    key={idx}
                    style={[styles.recentRow, { backgroundColor: colors.subCardBg, borderColor: colors.border }]}
                  >
                    <View style={styles.recentCheckIcon}>
                      <Text style={{ color: colors.green, fontWeight: '800', fontSize: 13 }}>✓</Text>
                    </View>
                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <Text style={[styles.recentTitle, { color: colors.textPrimary }]}>{s.title}</Text>
                      <Text style={[styles.recentDate, { color: colors.textMuted }]}>Solved on {s.timestamp}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.openBtnTag, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
                      onPress={() => openProblemUrl(s.title)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.openBtnText, { color: colors.cyan }]}>Open ↗</Text>
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <View style={[styles.noSubBox, { backgroundColor: colors.subCardBg }]}>
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

        {/* Top Navbar */}
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
              style={[styles.themeToggleBtn, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
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
          </View>
        </View>

        {/* Daily POTD Glowing Banner */}
        {dailyProblem && (
          <TouchableOpacity
            style={[styles.potdBanner, { backgroundColor: colors.cardBg, borderColor: colors.primaryBorder }]}
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
                  { backgroundColor: `${getDifficultyMeta(dailyProblem.difficulty).color}20`, borderColor: `${getDifficultyMeta(dailyProblem.difficulty).color}60` },
                ]}
              >
                <Text style={[styles.potdDiffText, { color: getDifficultyMeta(dailyProblem.difficulty).color }]}>
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
              <Text style={[styles.potdSolveText, { color: colors.cyan }]}>Solve Now ↗</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Dedicated Responsive Live Activity Banner */}
        <TouchableOpacity
          style={[styles.liveActivityBanner, { backgroundColor: colors.cardBg, borderColor: colors.primaryBorder }]}
          onPress={() => {
            setSelectedDayIndex(0);
            setIsTodayTrackScreenOpen(true);
          }}
          activeOpacity={0.8}
        >
          <View style={styles.liveActivityLeft}>
            <View style={[styles.liveActivityIconRing, { backgroundColor: colors.primaryBg }]}>
              <Text style={{ fontSize: 16 }}>🎯</Text>
            </View>
            <View>
              <Text style={[styles.liveActivityTitle, { color: colors.textPrimary }]}>Live Team Activity</Text>
              <Text style={[styles.liveActivitySub, { color: colors.textMuted }]}>Today & past 7 days records</Text>
            </View>
          </View>

          <View style={[styles.liveActivityCountBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.liveActivityCountText}>
              {totalSolvesTodayCount} Solved Today
            </Text>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>↗</Text>
          </View>
        </TouchableOpacity>

        {/* Search Field */}
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

        {/* Sorting Tabs Full Screen Width */}
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
        </View>

        {/* Team Leaderboard Cards */}
        <FlatList
          data={filteredMembers}
          keyExtractor={(item) => item.username}
          refreshing={refreshing}
          onRefresh={() => refreshTeam(members.map((m) => m.username), true, true)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
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
                  index === 0 && { borderColor: '#ff990080' },
                ]}
              >
                <View style={styles.cardHead}>
                  <View style={styles.rankInfo}>
                    <View style={[styles.podiumBadge, { backgroundColor: rankBadge.bg, borderColor: rankBadge.border }]}>
                      <Text style={[styles.podiumText, { color: rankBadge.text }]}>{rankBadge.label}</Text>
                    </View>

                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={[styles.cardAvatarImage, { borderColor: colors.cyan }]} />
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
                          <View style={[styles.streakBadge, { backgroundColor: colors.primaryBg, borderColor: colors.primaryBorder }]}>
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
                  <View style={[styles.seg, { width: `${easyP}%`, backgroundColor: colors.green }]} />
                  <View style={[styles.seg, { width: `${medP}%`, backgroundColor: colors.yellow }]} />
                  <View style={[styles.seg, { width: `${hardP}%`, backgroundColor: colors.red }]} />
                </View>

                <View style={styles.statsFlex}>
                  <View style={styles.totalBox}>
                    <Text style={[styles.totalText, { color: colors.textPrimary }]}>{item.totalSolved}</Text>
                    <Text style={[styles.subLabel, { color: colors.textMuted }]}>Solved</Text>
                  </View>

                  <View style={styles.badges}>
                    <View style={[styles.badgeItem, { backgroundColor: `${colors.green}18`, borderColor: `${colors.green}40` }]}>
                      <Text style={[styles.badgeVal, { color: colors.green }]}>{item.easySolved}</Text>
                      <Text style={[styles.badgeDiff, { color: colors.textSecondary }]}>Easy</Text>
                    </View>
                    <View style={[styles.badgeItem, { backgroundColor: `${colors.yellow}18`, borderColor: `${colors.yellow}40` }]}>
                      <Text style={[styles.badgeVal, { color: colors.yellow }]}>{item.mediumSolved}</Text>
                      <Text style={[styles.badgeDiff, { color: colors.textSecondary }]}>Med</Text>
                    </View>
                    <View style={[styles.badgeItem, { backgroundColor: `${colors.red}18`, borderColor: `${colors.red}40` }]}>
                      <Text style={[styles.badgeVal, { color: colors.red }]}>{item.hardSolved}</Text>
                      <Text style={[styles.badgeDiff, { color: colors.textSecondary }]}>Hard</Text>
                    </View>

                    <View
                      style={[
                        styles.badgeItem,
                        item.solvedDailyToday
                          ? { backgroundColor: `${colors.green}20`, borderColor: `${colors.green}60` }
                          : { backgroundColor: colors.subCardBg, borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeVal,
                          { color: item.solvedDailyToday ? colors.green : colors.textMuted },
                        ]}
                      >
                        {item.solvedDailyToday ? '✓' : '⏳'}
                      </Text>
                      <Text
                        style={[
                          styles.badgeDiff,
                          { color: item.solvedDailyToday ? colors.green : colors.textMuted, fontWeight: '800' },
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
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Settings & Team</Text>
                <TouchableOpacity onPress={() => setDrawerOpen(false)} style={[styles.sheetClose, { backgroundColor: colors.subCardBg }]}>
                  <Text style={[styles.sheetCloseText, { color: colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>

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
  splashGlowHalo: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#ff990020' },
  splashBadgeIcon: { width: 70, height: 70, borderRadius: 22, backgroundColor: '#ff990020', borderWidth: 1.5, borderColor: '#ff990060', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  splashTitle: { fontSize: 44, fontWeight: '900', color: '#ff9900', letterSpacing: 5 },
  splashSubBadge: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#ff990015', borderWidth: 1, borderColor: '#ff990040' },
  splashSubBadgeText: { color: '#ff9900', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },

  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drawerBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  drawerBtnIcon: { fontSize: 16, fontWeight: '900' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  themeToggleBtn: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 12 },
  themeToggleBtnText: { fontSize: 14, fontWeight: '700' },
  reminderHeaderBtn: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  reminderHeaderBtnText: { fontSize: 12, fontWeight: '800' },
  todayCountTag: { borderWidth: 1, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12 },
  todayCountTagText: { fontSize: 12, fontWeight: '800' },

  potdBanner: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 18, borderWidth: 1 },
  potdHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  potdTagWrapper: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  potdSparkle: { fontSize: 12 },
  potdTag: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  potdDiffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  potdDiffText: { fontSize: 11, fontWeight: '800' },
  potdTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10 },
  potdFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  potdTopicsRow: { flexDirection: 'row', gap: 6 },
  potdTopicItem: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  potdTopicText: { fontSize: 10, fontWeight: '700' },
  potdSolveText: { fontSize: 12, fontWeight: '800' },

  liveActivityBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveActivityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  liveActivityIconRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveActivityTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  liveActivitySub: {
    fontSize: 11,
    marginTop: 1,
    fontWeight: '600',
  },
  liveActivityCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  liveActivityCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },

  dayPickerScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dayPickerCard: {
    width: 90,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPickerLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  dayPickerSubLabel: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
  },
  dayPickerCountBadge: {
    marginTop: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  dayPickerCountText: {
    fontSize: 10,
    fontWeight: '900',
  },

  searchRow: { paddingHorizontal: 16, marginBottom: 12 },
  searchInput: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, fontSize: 13, borderWidth: 1 },

  filterTabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 14, gap: 8 },
  sortLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12, fontWeight: '700' },
  activeTabText: { color: '#fff', fontWeight: '900' },

  card: { borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  rankInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  podiumBadge: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  podiumText: { fontSize: 13, fontWeight: '900' },
  cardAvatarImage: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5 },
  cardAvatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardAvatarText: { fontSize: 14, fontWeight: '900' },
  cardName: { fontSize: 16, fontWeight: '900' },
  cardHandle: { fontSize: 12, marginTop: 1 },
  ownerBadge: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5 },
  ownerBadgeText: { fontSize: 9, fontWeight: '900' },
  ownerSmallBadge: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5 },
  ownerSmallBadgeText: { fontSize: 9, fontWeight: '900' },
  streakBadge: { borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  streakText: { fontSize: 10, fontWeight: '800' },
  delText: { fontSize: 15, padding: 4 },
  bar: { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
  seg: { height: '100%' },
  statsFlex: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalBox: { alignItems: 'flex-start' },
  totalText: { fontSize: 22, fontWeight: '900' },
  subLabel: { fontSize: 9, textTransform: 'uppercase', fontWeight: '800', letterSpacing: 0.5 },
  badges: { flexDirection: 'row', gap: 6 },
  badgeItem: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, alignItems: 'center', minWidth: 44, borderWidth: 1 },
  badgeVal: { fontSize: 13, fontWeight: '900' },
  badgeDiff: { fontSize: 9, marginTop: 1, fontWeight: '700' },
  emptyState: { alignItems: 'center', marginTop: 44, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 36, marginBottom: 10 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  onboardingCard: { padding: 28, borderRadius: 24, borderWidth: 1, alignItems: 'center' },
  onboardingIconRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  onboardingBadge: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 6 },
  onboardingTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  onboardingSub: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 22 },
  onboardingInput: { width: '100%', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, borderWidth: 1, marginBottom: 16 },
  onboardingBtn: { width: '100%', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  onboardingBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },

  drawerProfileBtn: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, gap: 12, marginBottom: 10 },
  drawerAvatar: { width: 44, height: 44, borderRadius: 22 },
  drawerAvatarFallback: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  drawerProfileName: { fontSize: 16, fontWeight: '900' },
  drawerProfileHandle: { fontSize: 12, marginTop: 1 },
  drawerAddRow: { flexDirection: 'row', gap: 8 },
  drawerInput: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, borderWidth: 1 },
  drawerAddBtn: { borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  drawerAddBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  signOutBtn: { marginTop: 18, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#f43f5e15', borderWidth: 1, borderColor: '#f43f5e50' },
  signOutBtnText: { color: '#f43f5e', fontSize: 14, fontWeight: '900' },

  profileNavBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  navBackBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  navBackBtnText: { fontSize: 13, fontWeight: '800' },
  externalLinkBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  externalLinkBtnText: { fontSize: 12, fontWeight: '900' },
  profileScroll: { padding: 16, paddingBottom: 44 },
  profileCard: { padding: 22, borderRadius: 22, alignItems: 'center', marginBottom: 16, borderWidth: 1 },
  profileAvatarImage: { width: 74, height: 74, borderRadius: 37, borderWidth: 2, marginBottom: 12 },
  profileAvatar: { width: 74, height: 74, borderRadius: 37, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileAvatarText: { fontSize: 28, fontWeight: '900' },
  profileRealName: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  profileHandle: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' },
  pillBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: '800' },
  profileSection: { padding: 18, borderRadius: 20, marginBottom: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },

  personTrackCard: { borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1 },
  personTrackHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  personTrackAvatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5 },
  personTrackAvatarFallback: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  personTrackName: { fontSize: 16, fontWeight: '900' },
  personTrackHandle: { fontSize: 12, marginTop: 1 },
  personSolvedCountBadge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  personSolvedCountText: { fontSize: 12, fontWeight: '900' },
  personSubRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1 },
  inlineQuestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 },
  compactDiffBadge: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  compactDiffText: { fontSize: 10, fontWeight: '900' },
  recentTitle: { fontSize: 14, fontWeight: '800', flex: 1, flexWrap: 'wrap', lineHeight: 19 },
  noSubPersonBox: { padding: 12, borderRadius: 10, marginTop: 10, alignItems: 'center' },

  difficultyContainer: { flexDirection: 'row', gap: 8, marginTop: 14 },
  diffItemBox: { flex: 1, paddingVertical: 16, paddingHorizontal: 6, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  diffNumber: { fontSize: 20, fontWeight: '900' },
  diffLabel: { fontSize: 12, fontWeight: '800', marginTop: 4 },

  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  gridItem: { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1 },
  gridVal: { fontSize: 16, fontWeight: '900' },
  gridLbl: { fontSize: 10, marginTop: 4, textTransform: 'uppercase', fontWeight: '800' },

  heatmapHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  tooltipBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  tooltipText: { fontSize: 10, fontWeight: '800' },

  matrixScroll: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  monthsContainerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  monthBlock: {
    alignItems: 'flex-start',
  },
  monthBlockLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
  },
  monthWeeksRow: {
    flexDirection: 'row',
    gap: 3,
  },
  weekColumn: {
    alignItems: 'center',
    gap: 3,
  },
  leetCodeSquare: {
    width: 12,
    height: 12,
    borderRadius: 2.5,
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: 12,
  },
  legendBox: {
    width: 11,
    height: 11,
    borderRadius: 2.5,
  },
  legendText: {
    fontSize: 10,
    marginHorizontal: 2,
    fontWeight: '600',
  },

  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  topicBadge: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  topicName: { fontSize: 12, fontWeight: '800' },
  topicCount: { fontSize: 10, marginTop: 1, fontWeight: '700' },
  pastHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pastCountText: { fontSize: 12, fontWeight: '700' },
  recentRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 8, borderWidth: 1 },
  recentCheckIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#10b98115', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  recentDate: { fontSize: 11, marginTop: 2 },
  openBtnTag: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  openBtnText: { fontSize: 11, fontWeight: '900' },
  noSubBox: { padding: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1 },

  modalShade: { flex: 1, backgroundColor: 'rgba(3,5,10,0.88)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '85%', borderWidth: 1 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 22, fontWeight: '900' },
  sheetClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 14, fontWeight: '900' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 14, borderWidth: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '800' },
  sheetSub: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },

  customTimePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 16, borderWidth: 1, gap: 12 },
  timeInputContainer: { alignItems: 'center' },
  timeDigitInput: { fontSize: 24, fontWeight: '900', textAlign: 'center', width: 68, height: 54, borderRadius: 12, borderWidth: 1 },
  timeInputSub: { fontSize: 10, marginTop: 4, fontWeight: '700' },
  timeColon: { fontSize: 26, fontWeight: '900', marginBottom: 12 },
  amPmContainer: { flexDirection: 'column', gap: 5, marginLeft: 8 },
  amPmBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1 },
  amPmText: { fontSize: 12, fontWeight: '900' },

  timeSlotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeSlotBtn: { flex: 1, minWidth: '45%', paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 1 },
  timeSlotText: { fontSize: 12, fontWeight: '800' },
  actionMainBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  actionMainBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});