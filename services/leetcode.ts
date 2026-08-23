// services/leetcode.ts

export interface RecentSubmission {
  id: string;
  title: string;
  timestamp: string;
  rawTimestamp?: number;
  lang?: string;
}

export interface TopicTag {
  name: string;
  solved: number;
}

export interface HeatmapSquare {
  date: string;
  count: number;
  level: number;
  dayOfWeek: number;
  monthLabel?: string;
  isToday?: boolean;
}

export interface HeatmapWeek {
  weekIndex: number;
  days: (HeatmapSquare | null)[];
  monthLabel?: string;
}

export interface DailyChallenge {
  date: string;
  title: string;
  difficulty: string;
  link: string;
  topicTags: string[];
}

export interface LeetCodeStats {
  username: string;
  realName: string;
  avatar?: string;
  ranking: number;
  contestRating: number;
  contestGlobalRank: number;
  contestAttended: number;
  contestBadge: string;
  streak: number;
  solvedDailyToday: boolean;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  acceptanceRate: number;
  recentSubmissions: RecentSubmission[];
  topTopics: TopicTag[];
  heatmapWeeks: HeatmapWeek[];
  totalActiveDays: number;
}

export async function fetchDailyChallenge(): Promise<DailyChallenge> {
  const query = `
    query getDailyProblem {
      activeDailyCodingChallengeQuestion {
        date
        link
        question {
          title
          difficulty
          topicTags {
            name
          }
        }
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
      body: JSON.stringify({ query }),
    });

    if (res.ok) {
      const json = await res.json();
      const daily = json.data?.activeDailyCodingChallengeQuestion;
      if (daily?.question) {
        return {
          date: daily.date,
          title: daily.question.title,
          difficulty: daily.question.difficulty || 'Medium',
          link: `https://leetcode.com${daily.link}`,
          topicTags: (daily.question.topicTags || []).map((t: any) => t.name),
        };
      }
    }
  } catch (_) {}

  return {
    date: new Date().toISOString().split('T')[0],
    title: 'Daily LeetCode Challenge',
    difficulty: 'Medium',
    link: 'https://leetcode.com/problemset/all/',
    topicTags: ['Array', 'Dynamic Programming', 'Hash Table'],
  };
}

function parseRawEpochSeconds(ts: any): number {
  if (!ts) return 0;
  const num = typeof ts === 'string' ? parseInt(ts, 10) : Number(ts);
  if (isNaN(num)) return 0;
  return num > 1e11 ? Math.floor(num / 1000) : num;
}

function formatTimestamp(ts: any): string {
  const epochSec = parseRawEpochSeconds(ts);
  if (!epochSec) return 'Recent';
  const date = new Date(epochSec * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function checkSolvedTodayAccurate(recentList: RecentSubmission[], dailyProblemTitle?: string): boolean {
  if (!dailyProblemTitle || !recentList || recentList.length === 0) return false;
  const targetTitle = dailyProblemTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const now = new Date();
  const startOfTodayUtc = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
  const endOfTodayUtc = startOfTodayUtc + 86400;

  return recentList.some((sub) => {
    const subTitle = sub.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isTitleMatch = subTitle.includes(targetTitle) || targetTitle.includes(subTitle);
    if (!isTitleMatch) return false;
    if (sub.rawTimestamp && sub.rawTimestamp > 0) {
      return sub.rawTimestamp >= startOfTodayUtc && sub.rawTimestamp < endOfTodayUtc;
    }
    return true;
  });
}

function parseLeetCodeCalendarMatrix(rawCalendar: any): { weeks: HeatmapWeek[]; streak: number; totalActiveDays: number } {
  let calendarMap: Record<string, number> = {};
  try {
    if (typeof rawCalendar === 'string') {
      calendarMap = JSON.parse(rawCalendar);
    } else if (typeof rawCalendar === 'object' && rawCalendar !== null) {
      calendarMap = rawCalendar;
    }
  } catch (_) {
    calendarMap = {};
  }

  let totalAllTimeActiveDays = 0;
  for (const cnt of Object.values(calendarMap)) {
    if (Number(cnt) > 0) {
      totalAllTimeActiveDays++;
    }
  }

  const now = new Date();
  const todayUtc = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
  const SECONDS_PER_DAY = 86400;

  const totalWeeks = 20;
  const totalDays = totalWeeks * 7;
  const todayDayOfWeek = now.getUTCDay();
  const startDateUtc = todayUtc - ((totalDays - 1 - (6 - todayDayOfWeek)) * SECONDS_PER_DAY);

  const weeks: HeatmapWeek[] = [];
  let currentWeek: (HeatmapSquare | null)[] = new Array(7).fill(null);
  let weekIdx = 0;
  let lastMonth = -1;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < totalDays; i++) {
    const dayTimestamp = startDateUtc + (i * SECONDS_PER_DAY);
    const dateObj = new Date(dayTimestamp * 1000);
    const dayOfWeek = dateObj.getUTCDay();
    const month = dateObj.getUTCMonth();
    const isFutureDay = dayTimestamp > todayUtc;
    const isCurrentDay = Math.abs(dayTimestamp - todayUtc) < 3600;

    if (!isFutureDay) {
      let count = 0;
      for (const [epochStr, cnt] of Object.entries(calendarMap)) {
        const epoch = parseInt(epochStr, 10);
        if (Math.abs(epoch - dayTimestamp) < SECONDS_PER_DAY) {
          count = Number(cnt) || 0;
          break;
        }
      }

      let level = 0;
      if (count >= 5) level = 3;
      else if (count >= 3) level = 2;
      else if (count >= 1) level = 1;

      let monthLabel: string | undefined;
      if (month !== lastMonth && dayOfWeek <= 2) {
        monthLabel = monthNames[month];
        lastMonth = month;
      }

      currentWeek[dayOfWeek] = {
        date: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        count,
        level,
        dayOfWeek,
        monthLabel,
        isToday: isCurrentDay,
      };
    } else {
      currentWeek[dayOfWeek] = null;
    }

    if (dayOfWeek === 6 || i === totalDays - 1) {
      const label = currentWeek.find((d) => d?.monthLabel)?.monthLabel;
      weeks.push({
        weekIndex: weekIdx++,
        days: [...currentWeek],
        monthLabel: label,
      });
      currentWeek = new Array(7).fill(null);
    }
  }

  let currentStreak = 0;
  const hasSolvedOnDay = (dayOffset: number) => {
    const target = todayUtc - (dayOffset * SECONDS_PER_DAY);
    for (const [epochStr, cnt] of Object.entries(calendarMap)) {
      const epoch = parseInt(epochStr, 10);
      if (Math.abs(epoch - target) < SECONDS_PER_DAY && Number(cnt) > 0) {
        return true;
      }
    }
    return false;
  };

  const solvedToday = hasSolvedOnDay(0);
  const solvedYesterday = hasSolvedOnDay(1);
  if (solvedToday || solvedYesterday) {
    let offset = solvedToday ? 0 : 1;
    while (hasSolvedOnDay(offset)) {
      currentStreak++;
      offset++;
    }
  }

  return { weeks, streak: currentStreak, totalActiveDays: totalAllTimeActiveDays };
}

// Helper to extract authentic topic breakdown from GraphQL tagProblemCounts
function parseTopTopics(tagCounts: any): TopicTag[] {
  if (!tagCounts) return [];

  const allTags: { name: string; solved: number }[] = [];
  const groups = ['fundamental', 'intermediate', 'advanced'];

  groups.forEach((group) => {
    if (Array.isArray(tagCounts[group])) {
      tagCounts[group].forEach((t: any) => {
        if (t.tagName && t.problemsSolved > 0) {
          allTags.push({
            name: t.tagName,
            solved: Number(t.problemsSolved),
          });
        }
      });
    }
  });

  // Sort descending by problems solved and pick the top topics
  return allTags.sort((a, b) => b.solved - a.solved).slice(0, 8);
}

async function getRecentSubmissionsSafe(clean: string): Promise<RecentSubmission[]> {
  try {
    const res = await fetch(`https://alfa-leetcode-api.onrender.com/${clean}/acSubmission?limit=15`);
    if (res.ok) {
      const json = await res.json();
      const list = Array.isArray(json) ? json : json.submission;
      if (Array.isArray(list) && list.length > 0) {
        return list.map((s: any) => ({
          id: String(s.id || Math.random()),
          title: s.title || s.titleSlug || 'Accepted Problem',
          timestamp: formatTimestamp(s.timestamp),
          rawTimestamp: parseRawEpochSeconds(s.timestamp),
          lang: s.lang,
        }));
      }
    }
  } catch (_) {}
  return [];
}

export async function fetchLeetCodeStats(
  username: string,
  dailyProblemTitle?: string
): Promise<LeetCodeStats | null> {
  const clean = username.trim();
  if (!clean) return null;

  // Primary: Official LeetCode GraphQL with real tagProblemCounts
  const graphqlQuery = `
    query getUserProfileWithSkills($username: String!) {
      matchedUser(username: $username) {
        username
        profile {
          realName
          ranking
          userAvatar
        }
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
            submissions
          }
          totalSubmissionNum {
            difficulty
            count
            submissions
          }
        }
        tagProblemCounts {
          fundamental {
            tagName
            problemsSolved
          }
          intermediate {
            tagName
            problemsSolved
          }
          advanced {
            tagName
            problemsSolved
          }
        }
        userCalendar {
          submissionCalendar
        }
      }
      recentAcSubmissionList(username: $username, limit: 15) {
        id
        title
        titleSlug
        timestamp
      }
    }
  `;

  try {
    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ query: graphqlQuery, variables: { username: clean } }),
    });

    if (response.ok) {
      const json = await response.json();
      const matched = json.data?.matchedUser;

      if (matched) {
        const acStats = matched.submitStatsGlobal?.acSubmissionNum || [];
        const totalStats = matched.submitStatsGlobal?.totalSubmissionNum || [];

        const getCount = (list: any[], diff: string) => list.find((s: any) => s.difficulty === diff)?.count || 0;
        const getSubs = (list: any[], diff: string) => list.find((s: any) => s.difficulty === diff)?.submissions || 0;

        const easy = getCount(acStats, 'Easy');
        const medium = getCount(acStats, 'Medium');
        const hard = getCount(acStats, 'Hard');
        const total = getCount(acStats, 'All') || (easy + medium + hard);

        const totalAcSubmissions = getSubs(acStats, 'All');
        const totalRawSubmissions = getSubs(totalStats, 'All');

        let officialRate = 0;
        if (totalRawSubmissions > 0 && totalAcSubmissions > 0) {
          officialRate = Math.round((totalAcSubmissions / totalRawSubmissions) * 100);
        }

        const { weeks, streak, totalActiveDays } = parseLeetCodeCalendarMatrix(matched.userCalendar?.submissionCalendar);
        const topTopics = parseTopTopics(matched.tagProblemCounts);

        const recent: RecentSubmission[] = (json.data?.recentAcSubmissionList || []).map((s: any) => ({
          id: String(s.id || s.title),
          title: s.title || s.titleSlug,
          timestamp: formatTimestamp(s.timestamp),
          rawTimestamp: parseRawEpochSeconds(s.timestamp),
        }));

        const isSolvedToday = checkSolvedTodayAccurate(recent, dailyProblemTitle);

        return {
          username: matched.username || clean,
          realName: matched.profile?.realName || clean,
          avatar: matched.profile?.userAvatar,
          ranking: matched.profile?.ranking || 0,
          contestRating: 0,
          contestGlobalRank: 0,
          contestAttended: 0,
          contestBadge: 'Active',
          streak,
          solvedDailyToday: isSolvedToday,
          totalSolved: total,
          easySolved: easy,
          mediumSolved: medium,
          hardSolved: hard,
          acceptanceRate: officialRate,
          recentSubmissions: recent,
          topTopics: topTopics.length > 0 ? topTopics : [{ name: 'Algorithms', solved: total }],
          heatmapWeeks: weeks,
          totalActiveDays,
        };
      }
    }
  } catch (_) {}

  // Fallback REST endpoint
  try {
    const res = await fetch(`https://leetcode-api-faisalshohag.vercel.app/${clean}`);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.totalSolved !== undefined || data.ranking !== undefined || data.name !== undefined)) {
        const easy = data.easySolved || 0;
        const medium = data.mediumSolved || 0;
        const hard = data.hardSolved || 0;
        const total = data.totalSolved || (easy + medium + hard);

        const { weeks, streak, totalActiveDays } = parseLeetCodeCalendarMatrix(data.submissionCalendar);
        const fallbackSubs = await getRecentSubmissionsSafe(clean);

        let recent: RecentSubmission[] = fallbackSubs;
        if (recent.length === 0 && Array.isArray(data.recentSubmissions)) {
          recent = data.recentSubmissions.slice(0, 15).map((s: any) => ({
            id: String(s.id || s.title),
            title: s.title || 'Accepted Submission',
            timestamp: formatTimestamp(s.timestamp),
            rawTimestamp: parseRawEpochSeconds(s.timestamp),
            lang: s.lang,
          }));
        }

        const isSolvedToday = checkSolvedTodayAccurate(recent, dailyProblemTitle);

        return {
          username: clean,
          realName: data.name || clean,
          avatar: data.avatar,
          ranking: data.ranking || 0,
          contestRating: 0,
          contestGlobalRank: 0,
          contestAttended: 0,
          contestBadge: 'Active',
          streak,
          solvedDailyToday: isSolvedToday,
          totalSolved: total,
          easySolved: easy,
          mediumSolved: medium,
          hardSolved: hard,
          acceptanceRate: data.acceptanceRate ? Math.round(data.acceptanceRate) : 0,
          recentSubmissions: recent,
          topTopics: [{ name: 'Algorithms', solved: total }],
          heatmapWeeks: weeks,
          totalActiveDays,
        };
      }
    }
  } catch (_) {}

  return null;
}