import ContestSubmission from "../models/contestSubmissionModel.js";
import ContestRanking from "../models/contestRankingModel.js"; 
import Contest from "../models/contestModel.js";
import User from "../models/userModel.js";

// ✅ 1. NEW FUNCTION: Called by your Worker to update a single user's rank
export const updateLeaderboard = async (contestId, userId, userName, problemScore) => {
  try {
    // Get contest start time for penalty calculation
    const contest = await Contest.findById(contestId).select("startDate");
    if (!contest) throw new Error("Contest not found");

    const contestStart = new Date(contest.startDate).getTime();
    
    // Fetch ALL submissions for this user in this contest
    const submissions = await ContestSubmission.find({ 
      contest: contestId, 
      user: userId 
    }).sort({ createdAt: "asc" });

    let totalScore = 0;
    let totalPenalty = 0;
    const problemResults = new Map(); // Track problem status

    for (const sub of submissions) {
      const problemId = sub.problem.toString();
      
      // If problem is already accepted, ignore later submissions
      if (problemResults.get(problemId)?.status === "Accepted") continue;

      const submissionTimeInMinutes = Math.max(
        0,
        Math.floor((new Date(sub.createdAt).getTime() - contestStart) / (1000 * 60))
      );

      const currentData = problemResults.get(problemId) || { penalty: 0 };

      if (sub.status === "Accepted") {
        // Accepted: Add time penalty + wrong attempt penalties
        const finalPenalty = currentData.penalty + submissionTimeInMinutes;
        
        problemResults.set(problemId, { status: "Accepted", penalty: finalPenalty });
        totalScore += sub.score || 10; 
        totalPenalty += finalPenalty;
      } else if (sub.status !== "Judging" && sub.status !== "Pending") {
        // Wrong Answer: Add 20 min penalty (only applies if eventually accepted)
        problemResults.set(problemId, { 
          status: "Attempted", 
          penalty: currentData.penalty + 20 
        });
      }
    }

    // Save/Update the ranking entry in the DB
    await ContestRanking.findOneAndUpdate(
      { contest: contestId, user: userId },
      {
        user: userId,
        userName: userName,
        contest: contestId,
        totalScore: totalScore,
        totalPenalty: totalPenalty,
        solvedCount: Array.from(problemResults.values()).filter(p => p.status === "Accepted").length,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log(`📊 Leaderboard updated for ${userName}: Score ${totalScore}`);

  } catch (error) {
    console.error("Error updating leaderboard:", error);
  }
};

// ✅ 2. YOUR EXISTING FUNCTION (For fetching full rankings)
export const calculateContestRanking = async (contestId, startTime) => {
  // Fetch all relevant submissions
  const submissions = await ContestSubmission.find({ contest: contestId })
    .select("user problem status createdAt points score") 
    .sort({ createdAt: "asc" });

  const contestStart = new Date(startTime).getTime();
  const penaltyPerWrong = 20;

  // Map<userId, { user, totalScore, totalPenalty, problemResults }>
  const userScores = new Map();

  for (const sub of submissions) {
    const userId = sub.user.toString();
    const problemId = sub.problem.toString();

    if (!userScores.has(userId)) {
      userScores.set(userId, {
        user: sub.user, 
        totalScore: 0,
        totalPenalty: 0,
        problemResults: new Map(),
      });
    }

    const userData = userScores.get(userId);

    if (
      userData.problemResults.has(problemId) &&
      userData.problemResults.get(problemId).status === "Accepted"
    ) {
      continue;
    }

    const submissionTimeInMinutes = Math.max(
      0,
      Math.floor((new Date(sub.createdAt).getTime() - contestStart) / (1000 * 60))
    );

    const currentProblemData = userData.problemResults.get(problemId) || {
      penalty: 0,
      status: "Not Attempted",
    };

    if (sub.status === "Accepted") {
      const finalPenalty = currentProblemData.penalty + submissionTimeInMinutes;

      userData.problemResults.set(problemId, {
        status: "Accepted",
        penalty: finalPenalty,
        submissionTime: submissionTimeInMinutes,
      });

      userData.totalScore += sub.points || sub.score || 10;
      userData.totalPenalty += finalPenalty;
    } else if (sub.status !== "Judging" && sub.status !== "Pending") {
      userData.problemResults.set(problemId, {
        status: "Attempted",
        penalty: currentProblemData.penalty + penaltyPerWrong,
        submissionTime: 0,
      });
    }
  }

  const rankingsArray = Array.from(userScores.values()).map((u) => ({
    user: u.user,
    totalScore: u.totalScore,
    totalPenalty: Math.round(u.totalPenalty),
    problemResults: Array.from(u.problemResults.entries()).map(([p, data]) => ({
      problem: p,
      ...data,
    })),
  }));
  
  await User.populate(rankingsArray, { path: "user", select: "username name photoUrl" });

  rankingsArray.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
    return a.totalPenalty - b.totalPenalty;
  });

  return rankingsArray.map((entry, index) => ({ ...entry, rank: index + 1 }));
};