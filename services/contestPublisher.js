import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js"; 
import mongoose from "mongoose";

export const publishEndedContestProblems = async () => {
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    const now = new Date();

    const contestsToPublish = await Contest.find({
      endTime: { $lte: now },
      problemsPublished: false 
    }).session(session).lean(); // 🔥 Lean is safe here since we extract IDs

    if (contestsToPublish.length === 0) return;

    console.log(`[Cron] Found ${contestsToPublish.length} contest(s) to publish.`);

    const problemIdsToPublish = [...new Set(
        contestsToPublish.flatMap(c => c.problems.map(p => p.problem))
    )];

    if (problemIdsToPublish.length > 0) {
      await Problem.updateMany(
        { _id: { $in: problemIdsToPublish } },
        // 🔥 CRITICAL: Manually bump updatedAt so the Redis versioned cache invalidates
        { $set: { isPublished: true, updatedAt: new Date() } }, 
        { session }
      );
    }

    const contestIds = contestsToPublish.map(c => c._id);
    await Contest.updateMany(
      { _id: { $in: contestIds } },
      { $set: { problemsPublished: true } },
      { session }
    );
  });
  session.endSession();
};