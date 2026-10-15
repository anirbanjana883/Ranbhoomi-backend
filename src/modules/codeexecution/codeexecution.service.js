import crypto from "crypto";
import Submission from "./submission.model.js";
import ContestSubmission from "./contestSubmission.model.js";
import Problem from "../problems/problem.model.js";
import Contest from "../contests/contest.model.js";
import ContestRegistration from "../contests/contestRegistration.model.js";
import { dispatchQueue, contestDispatchQueue } from "../../core/queue.js";
import { redisCache, redisTCP } from "../../core/redis.js";
import rankingService from "../contests/ranking.service.js";
import { ApiError } from "../../shared/utils/ApiError.js";

class CodeExecutionService {
  async createPracticeSubmission(data, userId) {
    if (await redisCache.get("circuit_breaker:judge0"))
      throw new ApiError(503, "Execution engine pausing");
    if ((await dispatchQueue.getWaitingCount()) > 5000)
      throw new ApiError(503, "System max capacity");

    const problem = await Problem.findOne({
      slug: data.slug,
      isDeleted: { $ne: true },
    })
      .select("_id")
      .lean();
    if (!problem) throw new ApiError(404, "Problem not found");

    let newSub;
    try {
      newSub = await Submission.create({
        user: userId,
        problem: problem._id,
        code: data.code,
        language: data.language,
        status: "Queued",
      });
    } catch (e) {
      if (e.code === 11000)
        throw new ApiError(429, "Evaluation already in progress");
      throw e;
    }

    try {
      await dispatchQueue.add(
        "dispatch-judge",
        {
          submissionId: newSub._id.toString(),
          code: data.code,
          language: data.language,
          slug: data.slug,
          userId,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
      );
    } catch (e) {
      await Submission.findByIdAndUpdate(newSub._id, {
        status: "Internal Error",
      });
      throw new ApiError(503, "Failed to enqueue");
    }
    return newSub._id;
  }

  async createContestSubmission(data, userId) {
    if (await redisCache.get("circuit_breaker:judge0"))
      throw new ApiError(503, "Execution engine pausing");
    if ((await contestDispatchQueue.getWaitingCount()) > 5000)
      throw new ApiError(503, "System max capacity");

    const lockKey = `lock:submit:${userId}:${data.problemSlug}`;
    if (!(await redisCache.set(lockKey, "locked", { nx: true, ex: 5 })))
      throw new ApiError(429, "Wait before submitting again");

    try {
      const contest = await Contest.findOne({ slug: data.slug })
        .select("_id startTime endTime problems")
        .lean();
      if (!contest) throw new ApiError(404, "Contest not found");

      const now = new Date();
      if (now < new Date(contest.startTime) || now > new Date(contest.endTime))
        throw new ApiError(400, "Contest not active");
      if (
        !(await ContestRegistration.exists({
          user: userId,
          contest: contest._id,
        }))
      )
        throw new ApiError(403, "Not registered");

      const problem = await Problem.findOne({ slug: data.problemSlug })
        .select("_id")
        .lean();
      if (
        !problem ||
        !contest.problems.some(
          (p) => p.problem.toString() === problem._id.toString(),
        )
      )
        throw new ApiError(400, "Invalid problem");

      const hash = crypto
        .createHash("sha256")
        .update(`${data.code}-${data.language}`)
        .digest("hex");
      const cachedResultStr = await redisCache.get(
        `cache:sub:${problem._id}:${hash}`,
      );

      if (cachedResultStr) {
        const cached =
          typeof cachedResultStr === "string"
            ? JSON.parse(cachedResultStr)
            : cachedResultStr;
        const newSub = await ContestSubmission.create({
          user: userId,
          problem: problem._id,
          contest: contest._id,
          code: data.code,
          language: data.language,
          status: cached.status,
          score: cached.score,
          executionTime: cached.executionTime,
          memoryUsed: cached.memoryUsed,
          results: cached.results,
          submissionTime: now,
        });
        await rankingService.updateLiveLeaderboard(
          contest._id,
          userId,
          data.problemSlug,
          cached.status,
          cached.score,
          now,
        );
        await redisTCP.publish(
          "submission-events",
          JSON.stringify({
            userId,
            submissionId: newSub._id,
            status: cached.status,
            score: cached.score,
          }),
        );
        await redisCache.del(lockKey);
        return { submissionId: newSub._id, cached: true };
      }

      const newSub = await ContestSubmission.create({
        user: userId,
        problem: problem._id,
        contest: contest._id,
        code: data.code,
        language: data.language,
        status: "Queued",
        judge0Tokens: [],
        results: [],
        score: 0,
        submissionTime: now,
      });
      await contestDispatchQueue.add(
        "process-contest-submission",
        {
          submissionId: newSub._id.toString(),
          code: data.code,
          language: data.language,
          slug: data.problemSlug,
          userId,
          isContest: true,
          contestId: contest._id,
        },
        {
          jobId: newSub._id.toString(),
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
        },
      );

      return { submissionId: newSub._id, cached: false };
    } catch (e) {
      await redisCache.del(lockKey);
      throw e;
    }
  }
}

export default new CodeExecutionService();
