// services/contestPublisher.js
import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js";
import mongoose from "mongoose";

export const publishEndedContestProblems = async () => {
  console.log("Running scheduled job: Checking for contests to publish...");
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const now = new Date();

    // 1. Find contests that have ended and whose problems are not yet published
    const contestsToPublish = await Contest.find({
      endTime: { $lte: now },       // Contest has ended
      problemsPublished: false     // Not yet published
    }).session(session);

    if (contestsToPublish.length === 0) {
      console.log("No contests to publish at this time.");
      await session.commitTransaction();
      session.endSession();
      return;
    }

    console.log(`Found ${contestsToPublish.length} contest(s) to publish.`);

    // 2. Collect all problem IDs from all found contests
    let problemIdsToPublish = [];
    for (const contest of contestsToPublish) {
      const ids = contest.problems.map(p => p.problem); // p.problem is the ObjectId
      problemIdsToPublish.push(...ids);
    }

    // Remove duplicate problem IDs (if a problem was in two contests)
    const uniqueProblemIds = [...new Set(problemIdsToPublish)];

    // 3. Update all those problems in one go
    if (uniqueProblemIds.length > 0) {
      await Problem.updateMany(
        { _id: { $in: uniqueProblemIds } },
        { $set: { isPublished: true } },
        { session }
      );
      console.log(`Published ${uniqueProblemIds.length} problems.`);
    }

    // 4. Update all the contests to mark them as "published"
    const contestIds = contestsToPublish.map(c => c._id);
    await Contest.updateMany(
      { _id: { $in: contestIds } },
      { $set: { problemsPublished: true } },
      { session }
    );

    // 5. Commit changes
    await session.commitTransaction();
    console.log("Successfully published problems and updated contests.");

  } catch (error) {
    await session.abortTransaction();
    console.error("Error in contest publishing job:", error);
  } finally {
    session.endSession();
  }
};