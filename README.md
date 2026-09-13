# LEETO ⚡ — LeetCode Team Compass & Live Activity Tracker

**LEETO** is a mobile application built with React Native and Expo designed for competitive programming teams, student cohorts, and coding circles. It tracks team members' real-time LeetCode activity, visualizes year-round consistency through contribution heatmaps, provides automated streak shield alerts, and delivers push notifications whenever a teammate solves a problem.

---

## 🌟 Key Features

### 1. Team Leaderboard & Performance Metrics
* **Dynamic Sorting:** Sort tracked teammates by **Total Solved**, **Active Streak**, or **Accuracy Rate**.
* **Difficulty Distribution Bar:** Displays a proportional visual ratio of Easy (Green), Medium (Yellow), and Hard (Red) solves for every user.
* **Contest Performance:** Fetches and displays global contest rating and attended contests directly from the LeetCode GraphQL API.
* **Topic Focus Breakdown:** Renders a list of the user's top Data Structures and Algorithms tags with individual solve counts.

### 2. Live Activity & 7-Day Solves Feed
* **UTC Calendar Alignment:** Synchronizes submissions accurately against UTC boundaries.
* **Interactive 7-Day Carousel:** Switch between **Today**, **Yesterday**, and the past 7 days to inspect team performance on specific dates.
* **Difficulty Indicators:** Compact, color-coded problem tags (`E`, `M`, `H`) displayed beside problem titles.
* **Direct Problem Links:** Clickable problem launcher tags that open questions directly in the browser.

### 3. Submission Heatmap Matrix
* **12-Month Grouped Matrix:** Visualizes full-year contribution history divided into distinct, labeled month blocks.
* **Intensity Scaling:** 4-level color scaling based on solve volume per day.
* **Interactive Inspection:** Tap any individual cell to view the exact solve count and formatted date.

### 4. Automated Streak Shield & Daily Reminders
* **POTD Detection:** Tracks daily completion status of the official LeetCode Problem of the Day (POTD).
* **Smart Local Notifications:** Configurable daily alarm that checks if the primary user has solved the daily challenge and triggers warning alerts if the streak is at risk.

### 5. Multi-Device Real-Time Push Notifications
* **Cloud Tracking Sync:** Synchronizes device push tokens and user watchlists via JSONBin.
* **Background Worker Automation:** A scheduled GitHub Actions worker periodically queries the LeetCode GraphQL API and dispatches Expo Push Notifications when new solutions are detected.

---

## 🛠 Tech Stack & Architecture

| Layer | Technology | Description |
|---|---|---|
| **Mobile Framework** | [React Native](https://reactnative.dev/) / [Expo](https://expo.dev/) | Cross-platform mobile development (Android & iOS) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | Type-safe application development |
| **Styling & UI** | React Native StyleSheet API | Dark/Light glassmorphism theme with custom animations |
| **Local Storage** | [`@react-native-async-storage/async-storage`](https://github.com/react-native-async-storage/async-storage) | Offline caching of handles, preferences, and tracking state |
| **Notifications** | [`expo-notifications`](https://docs.expo.dev/versions/latest/sdk/notifications/) | Local scheduling and remote push notification handlers |
| **Remote Poller / Cron** | [GitHub Actions](https://github.com/features/actions) | Background scheduled worker running on a cron queue |
| **Cloud State / Database** | [JSONBin.io API](https://jsonbin.io/) | Decentralized subscription store for device push tokens |
| **Data Provider** | [LeetCode GraphQL API](https://leetcode.com/graphql) | User stats, submission history, difficulty ratings, and POTD data |

---

## 📂 Project Structure

```text
├── .github/
│   └── workflows/
│       └── poll.yml               # GitHub Actions cron workflow for background polling
├── backend-worker/
│   ├── worker.js                  # Node.js script querying LeetCode and dispatching Expo pushes
│   └── last_seen.json             # Cache tracking the latest processed submission IDs
├── services/
│   ├── leetcode.ts                # LeetCode GraphQL/REST queries, difficulty caching & heatmap logic
│   └── notifications.ts           # Expo push token registration and notification handlers
├── App.tsx                        # Main UI, navigation state, modal sheets, and screens
├── app.json                       # Expo application manifest and permissions config
├── package.json                   # Dependencies and build scripts
└── tsconfig.json                  # TypeScript compiler settings
