import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js";
import ContestRanking from "../models/contestRankingModel.js";
import * as rankingService from "../services/rankingService.js"; 
import redisClient from "../config/redis.js"; 
import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// ---  FINALIZE LEADERBOARDS (Cron Endpoint) ---
export const finalizeEndedContests = asyncHandler(async (req, res) => {
  const now = new Date();

  const contestsToFinalize = await Contest.find({
    endTime: { $lte: now },
    isRankingsFinalized: { $ne: true },
  }).lean(); 

  if (contestsToFinalize.length === 0) {
    return res.status(200).json(new ApiResponse(200, null, "No contests require finalization at this time."));
  }

  const finalizedContests = [];

  for (const contest of contestsToFinalize) {
    console.log(`[Cron] Finalizing Ranking for: ${contest.title}`);

    const finalRankings = await rankingService.calculateContestRanking(
      contest._id,
      contest.startTime
    );

    await ContestRanking.findOneAndUpdate(
      { contest: contest._id },
      {
        contest: contest._id,
        rankings: finalRankings,
        calculatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    const cacheKey = `leaderboard:${contest.slug}`;
    const responseData = { contest: contest._id, rankings: finalRankings };
    await redisClient.set(cacheKey, JSON.stringify(responseData), "EX", 86400); 

    await redisClient.del(`live_leaderboard:${contest._id}`);
    await redisClient.del(`contest:${contest._id}:users`);
    await redisClient.del(`contest:${contest._id}:start`);

    await Contest.updateOne(
      { _id: contest._id },
      { $set: { isRankingsFinalized: true } }
    );
    
    finalizedContests.push(contest.title);
  }

  return res.status(200).json(
    new ApiResponse(200, { finalizedContests }, `Successfully finalized ${finalizedContests.length} contest(s).`)
  );
});

// ---  PUBLISH PROBLEMS POST-CONTEST (Cron Endpoint) ---
export const publishEndedContestProblems = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    let publishedProblemsCount = 0;
    let publishedContestsCount = 0;

    await session.withTransaction(async () => {
      const now = new Date();

      const contestsToPublish = await Contest.find({
        endTime: { $lte: now },
        problemsPublished: false 
      }).session(session).lean(); 

      if (contestsToPublish.length === 0) return;

      const problemIdsToPublish = [...new Set(
        contestsToPublish.flatMap(c => c.problems.map(p => p.problem))
      )];

      if (problemIdsToPublish.length > 0) {
        await Problem.updateMany(
          { _id: { $in: problemIdsToPublish } },
          { $set: { isPublished: true, updatedAt: new Date() } }, 
          { session }
        );
        publishedProblemsCount = problemIdsToPublish.length;
      }

      const contestIds = contestsToPublish.map(c => c._id);
      await Contest.updateMany(
        { _id: { $in: contestIds } },
        { $set: { problemsPublished: true } },
        { session }
      );
      publishedContestsCount = contestIds.length;
    });

    if (publishedContestsCount === 0) {
      return res.status(200).json(new ApiResponse(200, null, "No problems required publishing."));
    }

    return res.status(200).json(
      new ApiResponse(200, { publishedProblemsCount, publishedContestsCount }, "Contest problems successfully published.")
    );

  } catch (error) {
    throw new ApiError(500, "Transaction failed while publishing problems.", [], error.stack);
  } finally {
    session.endSession();
  }
});