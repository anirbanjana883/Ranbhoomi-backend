import ContestSubmission from "../models/contestSubmissionModel.js";
import Contest from "../models/contestModel.js";
import User from "../models/userModel.js";
import redisClient from "../config/redis.js"; 

// ─── STATE MANAGEMENT ──────────────────────────────────────────────
// In-memory map to prevent MongoDB Thundering Herds
const activeLeaderboardFetches = new Map();

// Constant for missing user fallback (cleaner & prevents memory allocation in loops)
const UNKNOWN_USER = { username: "unknown", name: "Unknown User", photoUrl: "" };

// ─── 1. WORKER FUNCTION: Live Updates (Pure Redis) ─────────────────
export const updateLeaderboard = async (contestId, userId, problemSlug, status, problemScore, submissionTime) => {
  try {
    const contestKey = `contest:${contestId}:users`;
    const leaderboardKey = `live_leaderboard:${contestId}`;

    // 1. Fetch cached start time
    let startTimeStr = await redisClient.get(`contest:${contestId}:start`);
    if (!startTimeStr) {
      const contest = await Contest.findById(contestId).select("startTime").lean();
      if (!contest) return;
      startTimeStr = contest.startTime.toISOString();
      await redisClient.set(`contest:${contestId}:start`, startTimeStr, "EX", 86400); 
    }
    const contestStart = new Date(startTimeStr).getTime();
    const timeElapsedMinutes = Math.max(0, Math.floor((new Date(submissionTime).getTime() - contestStart) / 60000));

    // 2. Fetch User State
    let userStateStr = await redisClient.hget(contestKey, userId.toString());
    let userState = userStateStr ? JSON.parse(userStateStr) : {
      user: userId, 
      totalScore: 0,
      totalPenalty: 0,
      problemResults: {}
    };

    if (!userState.problemResults[problemSlug]) {
      userState.problemResults[problemSlug] = { status: "Not Attempted", failedAttempts: 0, penalty: 0 };
    }

    const problemState = userState.problemResults[problemSlug];
    if (problemState.status === "Accepted") return;

    // 3. Update Scoring Logic
    if (status === "Accepted") {
      problemState.status = "Accepted";
      const finalPenalty = timeElapsedMinutes + (problemState.failedAttempts * 20);
      problemState.penalty = finalPenalty;
      
      userState.totalScore += problemScore || 10;
      userState.totalPenalty += finalPenalty;
    } else if (status !== "Judging" && status !== "Pending" && status !== "Queued") {
      problemState.failedAttempts += 1;
      problemState.status = "Attempted";
    }

    // 4. Save to Redis
    await redisClient.hset(contestKey, userId.toString(), JSON.stringify(userState));
    
    const redisScore = userState.totalScore - (userState.totalPenalty / 1000000);
    await redisClient.zadd(leaderboardKey, redisScore, userId.toString());

    // 5. Real-Time PubSub Broadcast
    await redisClient.publish("leaderboard-events", JSON.stringify({
        contestId,
        userId,
        newScore: userState.totalScore
    }));

  } catch (error) {
    console.error("Error updating live leaderboard:", error);
    throw error; 
  }
};

// ─── 2. FINALIZER FUNCTION: OOM Protected Batch Calculator ─────────
export const calculateContestRanking = async (contestId, startTime) => {
  const submissions = await ContestSubmission.find({ contest: contestId })
    .select("user problem status createdAt score") 
    .sort({ createdAt: 1 })
    .lean();

  const contestStart = new Date(startTime).getTime();
  const penaltyPerWrong = 20;
  const userScores = new Map();

  for (const sub of submissions) {
    const userId = sub.user.toString();
    const problemId = sub.problem.toString();

    if (!userScores.has(userId)) {
      userScores.set(userId, { user: sub.user, totalScore: 0, totalPenalty: 0, problemResults: new Map() });
    }

    const userData = userScores.get(userId);
    if (userData.problemResults.get(problemId)?.status === "Accepted") continue;

    const submissionTimeInMinutes = Math.max(0, Math.floor((new Date(sub.createdAt).getTime() - contestStart) / 60000));
    const currentProblemData = userData.problemResults.get(problemId) || { penalty: 0, status: "Not Attempted" };

    if (sub.status === "Accepted") {
      const finalPenalty = currentProblemData.penalty + submissionTimeInMinutes;
      userData.problemResults.set(problemId, { 
        status: "Accepted", penalty: finalPenalty, submissionTime: submissionTimeInMinutes 
      });
      userData.totalScore += sub.score || 10;
      userData.totalPenalty += finalPenalty;
    } else if (sub.status !== "Judging" && sub.status !== "Pending" && sub.status !== "Queued") {
      userData.problemResults.set(problemId, { 
        status: "Attempted", penalty: currentProblemData.penalty + penaltyPerWrong, submissionTime: 0 
      });
    }
  }

  const rankingsArray = Array.from(userScores.values()).map((u) => ({
    user: u.user,
    totalScore: u.totalScore,
    totalPenalty: Math.round(u.totalPenalty),
    problemResults: Array.from(u.problemResults.entries()).map(([p, data]) => ({ problem: p, ...data })),
  }));
  
  await User.populate(rankingsArray, { path: "user", select: "username name photoUrl" });

  rankingsArray.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
    return a.totalPenalty - b.totalPenalty;
  });

  return rankingsArray.map((entry, index) => ({ ...entry, rank: index + 1 }));
};

// ─── 3. FETCH LIVE LEADERBOARD (Coalesced & Hardened) ──────────────
export const getLiveLeaderboard = async (contestId) => {
    try {
        const leaderboardCacheKey = `live_leaderboard_cache:${contestId}`;

        //  Micro-Cache checking 
        const cachedLeaderboard = await redisClient.get(leaderboardCacheKey);
        if (cachedLeaderboard) {
            try {
                return JSON.parse(cachedLeaderboard);
            } catch (err) {
                console.warn(`Cache corruption detected for ${contestId}, rebuilding...`);
            }
        }

        //  Request Coalescing Guard
        if (activeLeaderboardFetches.has(contestId)) {
            return await activeLeaderboardFetches.get(contestId);
        }

        const fetchPromise = (async () => {
            const contestKey = `contest:${contestId}:users`;
            const leaderboardKey = `live_leaderboard:${contestId}`;

            // Timeout Guard
            const topUserIds = await Promise.race([
                await redisClient.zrange(leaderboardKey, 0, 99, { rev: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Redis ZREVRANGE timeout")), 2000))
            ]);
            
            if (!topUserIds || topUserIds.length === 0) return [];

            // Timeout Guard
            const userStates = await Promise.race([
                redisClient.hmget(contestKey, ...topUserIds),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Redis HMGET timeout")), 2000))
            ]);

            // Fetch User Profiles from MongoDB
            const users = await User.find({ _id: { $in: topUserIds } })
                .select("name username photoUrl")
                .lean();
                
            const userMap = users.reduce((acc, user) => {
                acc[user._id.toString()] = user;
                return acc;
            }, {});

            // Format & JSON Guard
            const formattedRankings = topUserIds.map((userId, index) => {
                // Ensure alignment and existence
                const stateRaw = userStates[index];
                if (!stateRaw) return null; 
                
                let state;
                try {
                    state = JSON.parse(stateRaw);
                } catch (parseError) {
                    console.error(`Corrupt JSON in Redis for user ${userId}:`, parseError.message);
                    return null; // Safely skip corrupted user
                }

                const safeProblemResults = state.problemResults || {};
                const problemResultsArray = Object.keys(safeProblemResults).map(slug => ({
                    problem: slug, 
                    status: safeProblemResults[slug].status,
                    penalty: safeProblemResults[slug].penalty
                }));

                return {
                    user: userMap[userId] || { _id: userId, ...UNKNOWN_USER },
                    rank: index + 1,
                    totalScore: state.totalScore || 0,
                    totalPenalty: state.totalPenalty || 0,
                    problemResults: problemResultsArray
                };
            }).filter(Boolean);

            // Clean API: Save Micro-Cache
            await redisClient.set(leaderboardCacheKey, JSON.stringify(formattedRankings), "EX", 3);
            
            return formattedRankings;
        })();

        // Register and await the coalesced promise
        activeLeaderboardFetches.set(contestId, fetchPromise);

        try {
            return await fetchPromise;
        } finally {
            activeLeaderboardFetches.delete(contestId);
        }

    } catch (error) {
        console.error("Error in getLiveLeaderboard:", error);
        throw error;
    }
};