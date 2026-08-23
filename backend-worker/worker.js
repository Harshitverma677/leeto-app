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
      headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });
    const data = await res.json();
    return {
      subscribers: data.record?.pushTokens || [],
      usersToTrack: data.record?.members || []
    };
  } catch (err) {
    console.error('Error fetching dynamic cloud config:', err.message);
    return { subscribers: [], usersToTrack: [] };
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

async function fetchLatestAcceptedSolve(username) {
  const query = `
    query getRecentSubmissions($username: String!) {
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
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({ query, variables: { username } }),
    });

    const json = await res.json();
    return json.data?.recentAcSubmissionList?.[0] || null;
  } catch (err) {
    console.error(`Failed to fetch for ${username}:`, err.message);
    return null;
  }
}

async function sendRemoteNotification(subscribers, title, body, url) {
  if (subscribers.length === 0) return;

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
        'Accept': 'application/json',
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
  const { subscribers, usersToTrack } = await getCloudTrackingConfig();

  if (usersToTrack.length === 0) {
    console.log('No members configured to track.');
    return;
  }

  console.log(`Checking solves for: ${usersToTrack.join(', ')}`);
  const lastSolves = loadPreviousSolves();
  let updated = false;

  for (const username of usersToTrack) {
    const latest = await fetchLatestAcceptedSolve(username);
    if (!latest) continue;

    const previousId = lastSolves[username];

    if (previousId && previousId !== latest.id) {
      console.log(`New solve detected for ${username}: ${latest.title}`);
      await sendRemoteNotification(
        subscribers,
        `🎯 ${username} solved a problem!`,
        `"${latest.title}" was just completed. Tap to view problem.`,
        `https://leetcode.com/problems/${latest.titleSlug}/`
      );
    }

    if (previousId !== latest.id) {
      lastSolves[username] = latest.id;
      updated = true;
    }
  }

  if (updated) {
    saveSolves(lastSolves);
  }
}

runWorker();