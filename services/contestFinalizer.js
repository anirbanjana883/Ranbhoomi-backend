// services/contestFinalizer.js
import Contest from "../models/contestModel.js";
import ContestRanking from "../models/contestRankingModel.js";
import * as rankingService from "./rankingService.js"; 
import redisClient from "../config/redis.js"; // 🔥 Ensure this points to the Upstash HTTP client

export const finalizeEndedContests = async () => {
  try {
    const now = new Date();

    // 1. Find contests securely and efficiently using Lean
    const contestsToFinalize = await Contest.find({
      endTime: { $lte: now },
      isRankingsFinalized: { $ne: true },
    }).lean(); // 🔥 Lean prevents RAM spikes if multiple contests end at once

    if (contestsToFinalize.length === 0) return;

    console.log(`[Cron] Found ${contestsToFinalize.length} contest(s) to finalize rankings.`);

    for (const contest of contestsToFinalize) {
      console.log(`⚙️ Processing Final Ranking for: ${contest.title}`);

      // 2. Calculate Final Ranking (This is heavily optimized in rankingService now)
      const finalRankings = await rankingService.calculateContestRanking(
        contest._id,
        contest.startTime || contest.startDate // (Ensure this matches your schema field name!)
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

      // 4. Update Redis Cache (Upstash Syntax)
      const cacheKey = `leaderboard:${contest.slug}`;
      const responseData = { contest: contest._id, rankings: finalRankings };
      
      // 🔥 Upstash requires the options object { ex: seconds }
      await redisClient.set(cacheKey, JSON.stringify(responseData), { ex: 86400 });

      // 🔥 5. CLEANUP: Delete the temporary Live Leaderboard to prevent Redis memory leaks
      await redisClient.del(`live_leaderboard:${contest._id}`);

      // 6. Mark Contest as Finalized (Atomic Update instead of .save() due to lean())
      await Contest.updateOne(
        { _id: contest._id },
        { $set: { isRankingsFinalized: true } }
      );
      
      console.log(`✅ Finalized ${contest.title} successfully.`);
    }
  } catch (error) {
    console.error("Error in finalizeEndedContests:", error);
  }
};