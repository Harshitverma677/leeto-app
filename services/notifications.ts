import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BIN_ID = '6a8adce9da38895dfe06ade0';
const MASTER_KEY = '$2a$10$q/z2mZGd58JtaJVXLOGB0OUhQHg9cSRyh98eCwHMfPeEF2vN5DXhe';
const EAS_PROJECT_ID = 'd2154c73-429b-4349-882d-dc09cb0e5de3';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // shouldShowAlert is deprecated — use shouldShowBanner + shouldShowList
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;

    // In Expo Go, setNotificationChannelAsync is unavailable and throws NullPointerException.
    // Skip channel creation entirely — it is only needed in standalone/EAS builds.
    const isExpoGo = Constants.appOwnership === 'expo';
    if (Platform.OS === 'android' && !isExpoGo) {
      try {
        await Notifications.setNotificationChannelAsync('leetdash-alerts', {
          name: 'LeetCode Updates',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#f97316',
          sound: 'default',
        });
      } catch (channelErr) {
        console.warn('Could not set notification channel:', channelErr);
      }
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.warn('Notice requesting notification permissions:', error);
    return false;
  }
}


export async function getDevicePushToken(): Promise<string | null> {
  try {
    // In Expo Go or Web, remote push tokens are unsupported and can throw fatal exceptions
    if (Constants.appOwnership === 'expo' || Platform.OS === 'web') {
      console.log('Skipping remote push token registration in Expo Go / Web environment');
      return null;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.warn('Notification permission not granted.');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      EAS_PROJECT_ID;

    if (!projectId) return null;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return tokenResponse?.data ?? null;
  } catch (error) {
    console.warn('Notice fetching Expo Push Token (non-fatal):', error);
    return null;
  }
}

/**
 * Syncs the device token and list of tracked friends to JSONBin
 */
export async function syncCloudTracking(trackedUsernames: string[]) {
  try {
    const token = await getDevicePushToken();
    if (!token) return;

    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      method: 'GET',
      headers: {
        'X-Master-Key': MASTER_KEY,
      },
    });

    if (!res.ok) {
      console.error(`Failed to read from JSONBin. Status: ${res.status}`);
      return;
    }

    const data = await res.json();
    let subscriptions: Array<{ token: string; tracking: string[] }> =
      data.record?.subscriptions || [];

    if (!Array.isArray(subscriptions)) {
      subscriptions = [];
    }

    const cleanUsernames = Array.from(
      new Set(trackedUsernames.map((u) => u.trim()).filter(Boolean))
    );

    const existingIndex = subscriptions.findIndex((sub) => sub.token === token);
    if (existingIndex >= 0) {
      subscriptions[existingIndex].tracking = cleanUsernames;
    } else {
      subscriptions.push({ token, tracking: cleanUsernames });
    }

    const putRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': MASTER_KEY,
      },
      body: JSON.stringify({ subscriptions }),
    });

    if (putRes.ok) {
      console.log('✅ Successfully synced device token to JSONBin:', token);
    } else {
      console.error('❌ Failed to update subscriptions on JSONBin. Status:', putRes.status);
    }
  } catch (err) {
    console.error('❌ Failed to sync token to JSONBin:', err);
  }
}

export async function scheduleDailyStreakReminder(
  hour: number,
  minute: number,
  questionTitle: string,
  questionUrl: string
) {
  try {
    await requestNotificationPermissions();

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.type === 'streak_reminder') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔥 Protect Your LeetCode Streak!',
        body: `Today's POTD: "${questionTitle}". Tap here to solve it now!`,
        data: { url: questionUrl, type: 'streak_reminder' },
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: 'leetdash-alerts' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch (error) {
    console.error('Error scheduling streak reminder:', error);
  }
}

export async function triggerLocalSolveNotification(
  playerName: string,
  problemTitle: string,
  problemUrl: string,
  solvedAtTimestamp?: number  // Unix epoch seconds from LeetCode API
) {
  try {
    await requestNotificationPermissions();

    // Format solve time: show "just now", "X min ago", or exact time
    let timeLabel = '';
    if (solvedAtTimestamp && solvedAtTimestamp > 0) {
      const solvedMs = solvedAtTimestamp * 1000;
      const diffMin = Math.floor((Date.now() - solvedMs) / 60000);
      if (diffMin < 1) {
        timeLabel = ' · just now';
      } else if (diffMin < 60) {
        timeLabel = ` · ${diffMin}m ago`;
      } else {
        const d = new Date(solvedMs);
        const h = d.getHours();
        const m = d.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        timeLabel = ` · at ${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🎯 ${playerName} solved a problem!`,
        body: `"${problemTitle}"${timeLabel} — Tap to view.`,
        data: { url: problemUrl, type: 'solve_alert' },
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: 'leetdash-alerts' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
      },
    });
  } catch (error) {
    console.error('Error triggering notification:', error);
  }
}


export async function triggerStreakShieldAlert(
  problemTitle: string,
  problemUrl: string
) {
  try {
    await requestNotificationPermissions();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Streak Shield Alert!',
        body: `Daily Challenge "${problemTitle}" is still pending! Tap to solve.`,
        data: { url: problemUrl, type: 'streak_reminder' },
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: 'leetdash-alerts' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
      },
    });
  } catch (error) {
    console.error('Error triggering streak alert:', error);
  }
}

export function broadcastSolveEvent(
  username: string,
  playerName: string,
  problemTitle: string,
  problemUrl: string
) {
  // Plug into backend WebSocket or remote dispatch if configured
}