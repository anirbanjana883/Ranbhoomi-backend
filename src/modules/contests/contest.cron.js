import Contest from "./contest.model.js";
import ContestRanking from "./contestRanking.model.js";
import Problem from "../problems/problem.model.js";
import rankingService from "./ranking.service.js";
import { redisCache } from "../../core/redis.js";
import mongoose from "mongoose";

export const finalizeEndedContests = async () => {
    const contests = await Contest.find({ endTime: { $lte: new Date() }, isRankingsFinalized: {$ne: true } }).lean();
    if (!contests.length) return [];

    const finalized = [];
    for (const contest of contests) {
        const finalRankings = await rankingService.calculateContestRanking(contest._id, contest.startTime);
        await ContestRanking.findOneAndUpdate({ contest: contest._id }, { contest: contest._id, rankings: finalRankings, calculatedAt: new Date() }, { upsert: true, new: true });
        
        await redisCache.set(`leaderboard:${contest.slug}`, JSON.stringify({ contest: contest._id, rankings: finalRankings }), { ex: 86400 });
        await redisCache.del(`live_leaderboard:${contest._id}`, `contest:${contest._id}:users`, `contest:${contest._id}:start`);
        await Contest.updateOne({ _id: contest._id }, { $set: { isRankingsFinalized: true } });
        finalized.push(contest.title);
    }
    return finalized;
};

export const publishEndedContestProblems = async () => {
    const session = await mongoose.startSession();
    let res = { probs: 0, conts: 0 };
    await session.withTransaction(async () => {
        const contests = await Contest.find({ endTime: { $lte: new Date() }, problemsPublished: false }).session(session).lean();
        if (!contests.length) return;

        const pIds = [...new Set(contests.flatMap(c => c.problems.map(p => p.problem)))];
        if (pIds.length) {
            await Problem.updateMany({ _id: { $in: pIds } }, {$set: { isPublished: true, updatedAt: new Date() } }, { session });
            res.probs = pIds.length;
        }

        const cIds = contests.map(c => c._id);
        await Contest.updateMany({ _id: { $in: cIds } }, {$set: { problemsPublished: true } }, { session });
        res.conts = cIds.length;
    });
    session.endSession();
    return res;
};