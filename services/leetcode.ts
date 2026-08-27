// services/leetcode.ts

export interface RecentSubmission {
  id: string;
  title: string;
  timestamp: string;
  rawTimestamp?: number;
  lang?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
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

export interface HeatmapMonthGroup {
  monthName: string;
  weeks: HeatmapWeek[];
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
  heatmapMonthGroups?: HeatmapMonthGroup[];
  totalActiveDays: number;
}

// In-memory cache for problem difficulties to prevent duplicate network calls
const difficultyCache: Record<string, 'Easy' | 'Medium' | 'Hard'> = {};

export async function fetchQuestionDifficulty(titleSlug: string): Promise<'Easy' | 'Medium' | 'Hard'> {
  if (!titleSlug) return 'Medium';
  const cleanSlug = titleSlug.toLowerCase().trim();
  if (difficultyCache[cleanSlug]) return difficultyCache[cleanSlug];

  const query = `
    query getQuestionDiff($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        difficulty
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
      body: JSON.stringify({ query, variables: { titleSlug: cleanSlug } }),
    });

    if (res.ok) {
      const json = await res.json();
      const diff = json.data?.question?.difficulty;
      if (diff === 'Easy' || diff === 'Medium' || diff === 'Hard') {
        difficultyCache[cleanSlug] = diff;
        return diff;
      }
    }
  } catch (_) {}

  return 'Medium';
}

export async function fetchDailyChallenge(): Promise<DailyChallenge> {
  const query = `
    query getDailyProblem {
      activeDailyCodingChallengeQuestion {
        date
        link
        question {
          title
          titleSlug
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
        if (daily.question.titleSlug && daily.question.difficulty) {
          difficultyCache[daily.question.titleSlug.toLowerCase()] = daily.question.difficulty;
        }

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

function parseLeetCodeCalendarMatrix(rawCalendar: any): { 
  weeks: HeatmapWeek[]; 
  monthGroups: HeatmapMonthGroup[]; 
  streak: number; 
  totalActiveDays: number 
} {
  let calendarMap: Record<string, number> = {};
  try {
    if (typeof rawCalendar === 'string') {
      calendarMap = JSON.parse(rawCalendar || '{}');
    } else if (typeof rawCalendar === 'object' && rawCalendar !== null) {
      calendarMap = rawCalendar;
    }
  } catch (_) {
    calendarMap = {};
  }

  let totalAllTimeActiveDays = 0;
  for (const cnt of Object.values(calendarMap)) {
    if (Number(cnt) > 0) totalAllTimeActiveDays++;
  }

  const now = new Date();
  const todayUtc = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
  const SECONDS_PER_DAY = 86400;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthGroups: HeatmapMonthGroup[] = [];
  const allWeeks: HeatmapWeek[] = [];

  let globalWeekIdx = 0;

  // Build rolling 12 months matrix
  for (let mOffset = 11; mOffset >= 0; mOffset--) {
    const targetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - mOffset, 1));
    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth();
    const monthName = monthNames[month];

    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const monthWeeks: HeatmapWeek[] = [];
    let currentWeek: (HeatmapSquare | null)[] = new Array(7).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      const dObj = new Date(Date.UTC(year, month, day));
      const dayTimestamp = Math.floor(dObj.getTime() / 1000);
      const dayOfWeek = dObj.getUTCDay();

      if (dayTimestamp <= todayUtc) {
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

        currentWeek[dayOfWeek] = {
          date: dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          count,
          level,
          dayOfWeek,
          isToday: Math.abs(dayTimestamp - todayUtc) < 3600,
        };
      } else {
        currentWeek[dayOfWeek] = null;
      }

      if (dayOfWeek === 6 || day === daysInMonth) {
        const weekObj: HeatmapWeek = {
          weekIndex: globalWeekIdx++,
          days: [...currentWeek],
        };
        monthWeeks.push(weekObj);
        allWeeks.push(weekObj);
        currentWeek = new Array(7).fill(null);
      }
    }

    if (monthWeeks.length > 0) {
      monthGroups.push({
        monthName,
        weeks: monthWeeks,
      });
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

  return { 
    weeks: allWeeks, 
    monthGroups, 
    streak: currentStreak, 
    totalActiveDays: totalAllTimeActiveDays 
  };
}

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

  return allTags.sort((a, b) => b.solved - a.solved).slice(0, 8);
}

export async function fetchLeetCodeStats(
  username: string,
  dailyProblemTitle?: string
): Promise<LeetCodeStats | null> {
  const clean = username.trim();
  if (!clean) return null;

  const graphqlQuery = `
    query getUserProfileWithContest($username: String!) {
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
      userContestRanking(username: $username) {
        attendedContestsCount
        rating
        globalRanking
        badge {
          name
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
      const contest = json.data?.userContestRanking;

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

        const { weeks, monthGroups, streak, totalActiveDays } = parseLeetCodeCalendarMatrix(matched.userCalendar?.submissionCalendar);
        const topTopics = parseTopTopics(matched.tagProblemCounts);

        const rawRecent = json.data?.recentAcSubmissionList || [];
        
        // Resolve authentic difficulty for each recent submission concurrently
        const recent: RecentSubmission[] = await Promise.all(
          rawRecent.map(async (s: any) => {
            const slug = s.titleSlug || s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const diff = await fetchQuestionDifficulty(slug);
            return {
              id: String(s.id || s.title),
              title: s.title || s.titleSlug,
              timestamp: formatTimestamp(s.timestamp),
              rawTimestamp: parseRawEpochSeconds(s.timestamp),
              difficulty: diff,
            };
          })
        );

        const isSolvedToday = checkSolvedTodayAccurate(recent, dailyProblemTitle);

        return {
          username: matched.username || clean,
          realName: matched.profile?.realName || clean,
          avatar: matched.profile?.userAvatar,
          ranking: matched.profile?.ranking || 0,
          contestRating: contest?.rating ? Math.round(contest.rating) : 0,
          contestGlobalRank: contest?.globalRanking || 0,
          contestAttended: contest?.attendedContestsCount || 0,
          contestBadge: contest?.badge?.name || 'Active',
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
          heatmapMonthGroups: monthGroups,
          totalActiveDays,
        };
      }
    }
  } catch (_) {}

  return null;
}