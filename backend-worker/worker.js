const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const http = require('http');

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const STATE_FILE = path.join(__dirname, 'last_seen.json');

// Your JSONBin Credentials
const JSONBIN_BIN_ID = '6a8adce9da38895dfe06ade0';
const JSONBIN_API_KEY = '$2a$10$q/z2mZGd58JtaJVXLOGB0OUhQHg9cSRyh98eCwHMfPeEF2vN5DXhe';

const FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'leetdash-mobile';

async function getCloudTrackingConfig() {
  // 1. Try querying Firestore REST API first
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users`;
    const res = await fetch(firestoreUrl);
    if (res.ok) {
      const data = await res.json();
      const documents = data.documents || [];
      const allMembers = [];
      const subscriptions = [];

      for (const doc of documents) {
        const fields = doc.fields || {};
        const username = fields.username?.stringValue;
        const tracking = (fields.trackingList?.arrayValue?.values || []).map((v) => v.stringValue).filter(Boolean);

        if (username) allMembers.push(username);
        allMembers.push(...tracking);

        if (tracking.length > 0) {
          // Query devices subcollection for this user
          try {
            const devRes = await fetch(`${doc.name}/devices`);
            if (devRes.ok) {
              const devData = await devRes.json();
              for (const devDoc of devData.documents || []) {
                const token = devDoc.fields?.token?.stringValue;
                if (token) {
                  subscriptions.push({ token, tracking });
                }
              }
            }
          } catch (_) {}
        }
      }

      const usersToTrack = Array.from(new Set(allMembers.filter(Boolean)));
      if (usersToTrack.length > 0) {
        console.log(`[Firestore] Loaded ${usersToTrack.length} members to track from Cloud Firestore.`);
        return { subscriptions, legacyTokens: [], usersToTrack };
      }
    }
  } catch (err) {
    console.warn('[Firestore] Notice fetching Firestore tracking config:', err.message);
  }

  // 2. Fallback to legacy JSONBin if configured
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_API_KEY },
    });
    const data = await res.json();
    const record = data.record || {};

    const subscriptions = record.subscriptions || [];
    let usersToTrack = [];

    if (subscriptions.length > 0) {
      const allMembers = subscriptions.flatMap((sub) => sub.tracking || []);
      usersToTrack = Array.from(new Set(allMembers));
    } else {
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

// 1. Lightweight HTTP health-check server for cloud hosts (Render, Railway, etc.)
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('LeetDash 24/7 Push Notification Worker is healthy and active!\n');
});

server.listen(PORT, () => {
  console.log(`🌐 [LeetDash Cloud Worker] Health server listening on port ${PORT}`);
});

// 2. Continuous 24/7 polling loop (checks every 60 seconds)
async function startWorkerLoop() {
  console.log('🚀 [LeetDash Cloud Worker] Initializing 24/7 background solve tracking loop...');
  try {
    await runWorker();
  } catch (err) {
    console.error('❌ Error during initial worker check:', err.message);
  }

  setInterval(async () => {
    try {
      await runWorker();
    } catch (err) {
      console.error('❌ Error in worker cycle:', err.message);
    }
  }, 60000); // Poll every 60 seconds
}

startWorkerLoop();
