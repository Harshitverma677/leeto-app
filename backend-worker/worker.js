const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const STATE_FILE = path.join(__dirname, 'last_seen.json');

// Your JSONBin Credentials
const JSONBIN_BIN_ID = '6a8adce9da38895dfe06ade0';
const JSONBIN_API_KEY = '$2a$10$q/z2mZGd58JtaJVXLOGB0OUhQHg9cSRyh98eCwHMfPeEF2vN5DXhe';

async function getCloudTrackingConfig() {
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_API_KEY },
    });
    const data = await res.json();
    const record = data.record || {};

    // Support both new structured format (subscriptions) and legacy format
    const subscriptions = record.subscriptions || [];
    let usersToTrack = [];

    if (subscriptions.length > 0) {
      // Gather all unique usernames across all devices
      const allMembers = subscriptions.flatMap((sub) => sub.tracking || []);
      usersToTrack = Array.from(new Set(allMembers));
    } else {
      // Fallback for legacy format { pushTokens: [], members: [] }
      usersToTrack = record.members || [];
    }

    return {
      subscriptions,
      legacyTokens: record.pushTokens || [],
      usersToTrack,
    };
  } catch (err) {
    console.error('Error fetching dynamic cloud config:', err.message);
    return { subscriptions: [], legacyTokens: [], usersToTrack: [] };
  }
}

function loadPreviousSolves() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveSolves(data) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

// Queries both latest solve and user's real display name
async function fetchUserSolvesAndProfile(username) {
  const query = `
    query getUserData($username: String!) {
      matchedUser(username: $username) {
        profile {
          realName
        }
      }
      recentAcSubmissionList(username: $username, limit: 1) {
        id
        title
        titleSlug
        timestamp
      }
    }
  `;

  try {
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ query, variables: { username } }),
    });

    const json = await res.json();
    const realName = json.data?.matchedUser?.profile?.realName?.trim() || null;
    const latestSolve = json.data?.recentAcSubmissionList?.[0] || null;

    return {
      displayName: realName || username,
      latestSolve,
    };
  } catch (err) {
    console.error(`Failed to fetch for ${username}:`, err.message);
    return { displayName: username, latestSolve: null };
  }
}

async function sendRemoteNotification(subscribers, title, body, url) {
  if (!subscribers || subscribers.length === 0) return;

  const messages = subscribers.map((token) => ({
    to: token,
    sound: 'default',
    title: title,
    body: body,
    data: { url },
  }));

  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const result = await response.json();
    console.log('Push notification dispatched:', result);
  } catch (err) {
    console.error('Error dispatching remote notification:', err.message);
  }
}

async function runWorker() {
  console.log(`[${new Date().toISOString()}] Fetching cloud tracking config...`);
  const { subscriptions, legacyTokens, usersToTrack } = await getCloudTrackingConfig();

  if (usersToTrack.length === 0) {
    console.log('No members configured to track.');
    return;
  }

  console.log(`Checking solves for: ${usersToTrack.join(', ')}`);
  const lastSolves = loadPreviousSolves();
  let updated = false;

  for (const username of usersToTrack) {
    const { displayName, latestSolve } = await fetchUserSolvesAndProfile(username);
    if (!latestSolve) continue;

    const previousId = lastSolves[username];

    if (previousId && previousId !== latestSolve.id) {
      console.log(`New solve detected for ${displayName} (@${username}): ${latestSolve.title}`);

      // Identify specifically which device tokens subscribe to this user
      let targetTokens = [];
      if (subscriptions.length > 0) {
        targetTokens = subscriptions
          .filter((sub) => sub.tracking && sub.tracking.includes(username))
          .map((sub) => sub.token);
      } else {
        targetTokens = legacyTokens;
      }

      await sendRemoteNotification(
        targetTokens,
        `🎯 ${displayName} solved a problem!`,
        `"${latestSolve.title}" was just completed. Tap to view problem.`,
        `https://leetcode.com/problems/${latestSolve.titleSlug}/`
      );
    }

    if (previousId !== latestSolve.id) {
      lastSolves[username] = latestSolve.id;
      updated = true;
    }
  }

  if (updated) {
    saveSolves(lastSolves);
  }
}

runWorker();