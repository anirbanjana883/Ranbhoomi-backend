import contestService from "./contest.service.js";
import contestRepository from "./contest.repository.js";
import rankingService from "./ranking.service.js";
import {
  finalizeEndedContests,
  publishEndedContestProblems,
} from "./contest.cron.js";
import { redisCache } from "../../core/redis.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";
import { ApiError } from "../../shared/utils/ApiError.js";

export const getAllContests = async (req, res) => {
  const all = await contestRepository.findAll();
  const now = new Date();
  res.status(200).json(
    new ApiResponse(200, {
      upcoming: all.filter((c) => new Date(c.startTime) > now),
      live: all.filter(
        (c) => new Date(c.startTime) <= now && new Date(c.endTime) > now,
      ),
      past: all.filter((c) => new Date(c.endTime) <= now),
    }),
  );
};

export const getRanking = async (req, res) => {
  const { slug } = req.params;
  const cacheKey = `leaderboard:${slug}:final`;
  const cached = await redisCache.get(cacheKey);
  if (cached)
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          typeof cached === "string" ? JSON.parse(cached) : cached,
        ),
      );

  const contest = await contestRepository.findBySlug(slug);
  if (!contest) throw new ApiError(404, "Contest not found");

  if (contest.isRankingsFinalized) {
    const ranking = await contestRepository.findRankings(contest._id);
    if (ranking) {
      await redisCache.set(cacheKey, JSON.stringify(ranking), { ex: 3600 });
      return res.status(200).json(new ApiResponse(200, ranking));
    }
  }
  res
    .status(200)
    .json(
      new ApiResponse(200, {
        contest: contest._id.toString(),
        rankings: await rankingService.getLiveLeaderboard(
          contest._id.toString(),
        ),
      }),
    );
};

export const getContestDetails = async (req, res) => {
  const contest = await contestRepository
    .findBySlug(req.params.slug)
    .populate("problems.problem", "title slug difficulty tags isPremium");
  if (!contest) throw new ApiError(404, "Contest not found");
  const obj = contest.toObject();
  obj.isRegistered = req.userId
    ? !!(await contestRepository.checkRegistration(req.userId, contest._id))
    : false;
  delete obj.registeredUsers;
  res.status(200).json(new ApiResponse(200, obj));
};

export const registerForContest = async (req, res) => {
  const contest = await contestRepository.findBySlug(req.params.slug);
  if (!contest) throw new ApiError(404, "Contest not found");
  if (new Date(contest.endTime) <= new Date())
    throw new ApiError(400, "Registration closed");
  if (
    contest.visibility === "PRIVATE" &&
    req.body.inviteCode !== contest.inviteCode
  )
    throw new ApiError(403, "Invalid code");

  try {
    await contestRepository.registerUser(req.userId, contest._id);
    res.status(200).json(new ApiResponse(200, null, "Registered"));
  } catch (e) {
    if (e.code === 11000) throw new ApiError(400, "Already registered");
    throw e;
  }
};

export const createContest = async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await contestService.createOfficial(req.body, req.userId),
      ),
    );
export const createPrivateContest = async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await contestService.createPrivate(req.body, req.userId),
      ),
    );
export const deleteContest = async (req, res) => {
  await contestService.deleteContest(req.params.slug);
  res.status(200).json(new ApiResponse(200, null, "Deleted"));
};

// Cron manual triggers
export const finalizeLeaderboardsCron = async (req, res) =>
  res.status(200).json(new ApiResponse(200, await finalizeEndedContests()));
export const publishProblemsCron = async (req, res) =>
  res
    .status(200)
    .json(new ApiResponse(200, await publishEndedContestProblems()));
