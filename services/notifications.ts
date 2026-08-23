import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('leetdash-alerts', {
      name: 'LeetCode Updates',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f97316',
      sound: 'default',
    });
  }

  return finalStatus === 'granted';
}

/**
 * Retrieves the unique Expo Push Token for this device.
 * Used for receiving remote notifications when the app is completely closed.
 */
export async function getDevicePushToken(): Promise<string | null> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    return tokenResponse.data;
  } catch (error) {
    console.error('Error fetching Expo Push Token:', error);
    return null;
  }
}

// Schedules a daily reminder with the direct question URL attached
export async function scheduleDailyStreakReminder(
  hour: number,
  minute: number,
  questionTitle: string,
  questionUrl: string
) {
  try {
    // Clear previous scheduled streak reminders
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
  problemUrl: string
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🎯 ${playerName} solved a problem!`,
        body: `"${problemTitle}" — Tap to view this problem.`,
        data: { url: problemUrl, type: 'solve_alert' },
        sound: 'default',
      },
      trigger: null,
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
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Streak Shield Alert!',
        body: `Daily Challenge "${problemTitle}" is still pending! Tap to solve.`,
        data: { url: problemUrl, type: 'streak_reminder' },
        sound: 'default',
      },
      trigger: null,
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
  // Can be plugged into your WebSocket/Firebase backend
}