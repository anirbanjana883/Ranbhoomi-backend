import ContestSubmission from "../models/contestSubmissionModel.js";
import ContestRanking from "../models/contestRankingModel.js"; 
import Contest from "../models/contestModel.js";
import User from "../models/userModel.js";
import redisClient from "../config/redis.js"; // Upstash HTTP client

// ✅ 1. WORKER FUNCTION: Live Updates
export const updateLeaderboard = async (contestId, userId, userName, problemScore) => {
  try {
    // 🔥 Fast Lean fetch
    const contest = await Contest.findById(contestId).select("startDate").lean();
    if (!contest) return;

    const contestStart = new Date(contest.startDate).getTime();
    
    // 🔥 Lean is mandatory here to prevent RAM bloat
    const submissions = await ContestSubmission.find({ 
      contest: contestId, 
      user: userId 
    }).sort({ createdAt: 1 }).lean(); 

    let totalScore = 0;
    let totalPenalty = 0;
    const problemResults = new Map();

    for (const sub of submissions) {
      const problemId = sub.problem.toString();
      if (problemResults.get(problemId)?.status === "Accepted") continue;

      const submissionTimeInMinutes = Math.max(0, Math.floor((new Date(sub.createdAt).getTime() - contestStart) / 60000));
      const currentData = problemResults.get(problemId) || { penalty: 0 };

      if (sub.status === "Accepted") {
        const finalPenalty = currentData.penalty + submissionTimeInMinutes;
        problemResults.set(problemId, { status: "Accepted", penalty: finalPenalty });
        totalScore += sub.score || 10; 
        totalPenalty += finalPenalty;
      } else if (sub.status !== "Judging" && sub.status !== "Pending") {
        problemResults.set(problemId, { status: "Attempted", penalty: currentData.penalty + 20 });
      }
    }

    // 1. Update MongoDB (Durability)
    await ContestRanking.findOneAndUpdate(
      { contest: contestId, user: userId },
      {
        user: userId, userName, contest: contestId,
        totalScore, totalPenalty,
        solvedCount: Array.from(problemResults.values()).filter(p => p.status === "Accepted").length,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // 🔥 2. Push to Redis Live Leaderboard (System 3)
    // We combine score & penalty into a single float for Redis sorting: Score.InversePenalty
    // Example: Score 100, Penalty 20 -> 100.000000 - (20/100000) -> 99.99980
    // This allows Redis to sort by Score DESC, then Penalty ASC automatically.
    const redisScore = totalScore - (totalPenalty / 1000000);
    await redisClient.zadd(`live_leaderboard:${contestId}`, { score: redisScore, member: userId });

  } catch (error) {
    console.error("Error updating leaderboard:", error);
  }
};


// ✅ 2. FINALIZER FUNCTION: OOM Protected
export const calculateContestRanking = async (contestId, startTime) => {
  // 🔥 LEAN IS MANDATORY HERE to prevent crashing the server
  const submissions = await ContestSubmission.find({ contest: contestId })
    .select("user problem status createdAt points score") 
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
      userData.problemResults.set(problemId, { status: "Accepted", penalty: finalPenalty, submissionTime: submissionTimeInMinutes });
      userData.totalScore += sub.points || sub.score || 10;
      userData.totalPenalty += finalPenalty;
    } else if (sub.status !== "Judging" && sub.status !== "Pending") {
      userData.problemResults.set(problemId, { status: "Attempted", penalty: currentProblemData.penalty + penaltyPerWrong, submissionTime: 0 });
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