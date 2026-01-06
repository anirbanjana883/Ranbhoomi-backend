// services/contestFinalizer.js
import Contest from "../models/contestModel.js";
import ContestRanking from "../models/contestRankingModel.js";
import * as rankingService from "./rankingService.js"; 
import redis from "../config/redis.js";

export const finalizeEndedContests = async () => {
  try {
    const now = new Date();

    // 1. Find contests that ended BUT are not yet marked as finalized
    // Note: Ensure your ContestSchema has `isRankingsFinalized: { type: Boolean, default: false }`
    const contestsToFinalize = await Contest.find({
      endTime: { $lte: now },
      isRankingsFinalized: { $ne: true },
    });

    if (contestsToFinalize.length === 0) return;

    console.log(`Found ${contestsToFinalize.length} contests to finalize rankings.`);

    for (const contest of contestsToFinalize) {
      console.log(`Processing Final Ranking for: ${contest.title}`);

      // 2. Calculate Final Ranking
      const finalRankings = await rankingService.calculateContestRanking(
        contest._id,
        contest.startTime
      );

      // 3. Save Permanently to DB
      await ContestRanking.findOneAndUpdate(
        { contest: contest._id },
        {
          contest: contest._id,
          rankings: finalRankings,
          calculatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      // 4. Update Redis Cache (Long TTL for Archive)
      // We cache the FINAL result for 24 hours (86400 seconds) or more.
      const cacheKey = `leaderboard:${contest.slug}`;
      const responseData = { contest: contest._id, rankings: finalRankings };
      
      await redis.set(cacheKey, JSON.stringify(responseData), "EX", 86400);

      // 5. Mark Contest as Finalized
      contest.isRankingsFinalized = true;
      await contest.save();
      
      console.log(`Finalized ${contest.title} successfully.`);
    }
  } catch (error) {
    console.error("Error in finalizeEndedContests:", error);
  }
};