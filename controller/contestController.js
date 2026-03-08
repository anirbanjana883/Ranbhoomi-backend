import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js";
import User from "../models/userModel.js";
import ContestSubmission from "../models/contestSubmissionModel.js";
import ContestRanking from "../models/contestRankingModel.js";
import ContestRegistration from "../models/contestRegistrationModel.js";
import mongoose from "mongoose";
import { randomBytes } from "crypto";
import redisClient from "../config/redis.js"; 
import * as rankingService from "../services/rankingService.js";

// --- IMPORT UTILITIES ---
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// --- CREATE CONTEST (Admin/Master Only) ---
export const createContest = asyncHandler(async (req, res) => {
    const { title, description, startTime, endTime, problemIds } = req.body;
    const createdBy = req.userId;

    //  Basic Field Validation
    if (!title || !description || !startTime || !endTime) {
        throw new ApiError(400, "Title, description, start time, and end time are required.");
    }

    //  Strict Time Validation
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (start < now) {
        throw new ApiError(400, "Contest start time must be in the future.");
    }
    if (end <= start) {
        throw new ApiError(400, "Contest end time must be after the start time.");
    }

    //  Slug Generation & Uniqueness Check
    const slug = title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
    
    const existingContest = await Contest.findOne({ $or: [{ title }, { slug }] }).lean();
    if (existingContest) {
        throw new ApiError(400, "A contest with this title or slug already exists.");
    }

    //  Problem Array Validation
    if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
        throw new ApiError(400, "At least one problem ID is required.");
    }

    // chekk: problems exist, are NOT published, and NOT deleted
    const validProblems = await Problem.find({ 
        _id: { $in: problemIds },
        isPublished: false,
        isDeleted: { $ne: true }
    }).select("_id").lean();

    if (validProblems.length !== problemIds.length) {
        const validIds = validProblems.map(p => p._id.toString());
        const invalidIds = problemIds.filter(id => !validIds.includes(id));
        
        throw new ApiError(400, `Invalid selection. The following problems are either already published, deleted, or do not exist: ${invalidIds.join(", ")}`);
    }

    //  Map to schema structure
    const problems = problemIds.map((id) => ({ problem: id }));

    //  Create the Contest
    const newContest = await Contest.create({
        title, 
        slug, 
        description, 
        startTime: start, 
        endTime: end, 
        problems, 
        createdBy
    });

    return res.status(201).json(new ApiResponse(201, newContest, "Contest created securely and successfully."));
});

// --- CREATE PRIVATE CONTEST (Premium Users Only) ---
export const createPrivateContest = asyncHandler(async (req, res) => {
  const { title, description, startTime, endTime, problemIds } = req.body;
  const createdBy = req.userId;

  if (!title || !startTime || !endTime) {
    throw new ApiError(400, "Title, start time, and end time are required.");
  }

  const inviteCode = randomBytes(3).toString("hex").toUpperCase();
  let rawSlug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
  const slug = `${rawSlug}-${inviteCode.toLowerCase()}`;

  if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
    throw new ApiError(400, "At least one problem ID is required.");
  }

  const foundProblems = await Problem.find({ _id: { $in: problemIds } }).select("_id");
  if (foundProblems.length !== problemIds.length) {
    const foundIds = foundProblems.map((p) => p._id.toString());
    const missingIds = problemIds.filter((id) => !foundIds.includes(id));
    throw new ApiError(400, `Invalid Problem IDs: ${missingIds.join(", ")}`);
  }

  const problems = problemIds.map((id) => ({ problem: id }));

  const newContest = new Contest({
    title, slug, description: description || "Private Contest",
    startTime, endTime, problems, createdBy, visibility: "PRIVATE", inviteCode
  });

  await newContest.save();

  return res.status(201).json(
    new ApiResponse(201, { contestId: newContest._id, inviteCode, slug }, "Private contest created successfully")
  );
});

// --- UPDATE PRIVATE CONTEST (User Only) ---
export const updatePrivateContest = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { title, description, startTime, endTime, problemIds } = req.body;
  const userId = req.userId;

  const contest = await Contest.findOne({ slug });
  if (!contest) throw new ApiError(404, "Contest not found");

  if (contest.createdBy.toString() !== userId) {
    throw new ApiError(403, "You do not have permission to edit this contest.");
  }

  if (new Date() >= new Date(contest.startTime)) {
    throw new ApiError(400, "Cannot edit a contest that has already started.");
  }

  if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
    throw new ApiError(400, "At least one problem ID is required.");
  }

  const foundProblems = await Problem.find({ _id: { $in: problemIds } }).select("_id");
  if (foundProblems.length !== problemIds.length) {
    const foundIds = foundProblems.map((p) => p._id.toString());
    const missingIds = problemIds.filter((id) => !foundIds.includes(id));
    throw new ApiError(400, `Invalid Problem IDs: ${missingIds.join(", ")}`);
  }

  contest.title = title || contest.title;
  contest.description = description || contest.description;
  contest.startTime = startTime || contest.startTime;
  contest.endTime = endTime || contest.endTime;

  if (problemIds && problemIds.length > 0) {
    contest.problems = problemIds.map((id) => ({ problem: id }));
  }

  await contest.save();
  return res.status(200).json(new ApiResponse(200, contest, "Contest updated successfully"));
});

// --- GET ALL CONTESTS (Public) ---
export const getAllContests = asyncHandler(async (req, res) => {
  const now = new Date();
  const allContests = await Contest.find({})
    .select("title slug description startTime endTime visibility")
    .sort({ startTime: -1 });

  const upcoming = allContests.filter((c) => new Date(c.startTime) > now);
  const live = allContests.filter((c) => new Date(c.startTime) <= now && new Date(c.endTime) > now);
  const past = allContests.filter((c) => new Date(c.endTime) <= now);

  return res.status(200).json(new ApiResponse(200, { upcoming, live, past }, "Contests fetched successfully"));
});

// --- GET SINGLE CONTEST DETAILS (Auth User) ---
export const getContestDetails = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const userId = req.userId;

  const contest = await Contest.findOne({ slug }).populate({
    path: "problems.problem",
    select: "title slug difficulty tags isPremium",
  });

  if (!contest) throw new ApiError(404, "Contest not found.");

  let isRegistered = false;
  if (userId) {
    const registration = await ContestRegistration.exists({ user: userId, contest: contest._id });
    isRegistered = !!registration;
  }

  const contestObject = contest.toObject();
  contestObject.isRegistered = isRegistered;
  delete contestObject.registeredUsers; // Security cleanup

  return res.status(200).json(new ApiResponse(200, contestObject, "Contest details fetched successfully"));
});

// --- REGISTER FOR CONTEST (Auth User) ---
export const registerForContest = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const userId = req.userId;

  const contest = await Contest.findOne({ slug }).select("_id startTime endTime visibility inviteCode");
  if (!contest) throw new ApiError(404, "Contest not found.");

  if (new Date(contest.endTime) <= new Date()) {
    throw new ApiError(400, "Registration is closed. This contest has already ended.");
  }

  if (contest.visibility === "PRIVATE" || contest.visibility === "Private") {
    if (!req.body.inviteCode || req.body.inviteCode !== contest.inviteCode) {
      throw new ApiError(403, "Invalid or missing invite code");
    }
  }

  try {
    await ContestRegistration.create({ user: userId, contest: contest._id });
    
    return res.status(200).json(new ApiResponse(200, null, "Successfully registered for the arena!"));
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(400, "You are already registered for this contest.");
    }
    throw err;
  }
});

// --- DELETE CONTEST (Admin/Master Only) ---
export const deleteContest = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  
  // We keep the Try-Catch here strictly for managing the Transaction Session
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const contest = await Contest.findOneAndDelete({ slug }).session(session);
    if (!contest) {
      await session.commitTransaction();
      session.endSession();
      throw new ApiError(404, "Contest not found.");
    }

    await ContestSubmission.deleteMany({ contest: contest._id }).session(session);
    await ContestRegistration.deleteMany({ contest: contest._id }).session(session);

    await session.commitTransaction();
    session.endSession();
    
    return res.status(200).json(new ApiResponse(200, null, "Contest deleted successfully."));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw new ApiError(error.statusCode || 500, error.message || "Failed to delete contest");
  }
});

// --- UPDATE CONTEST (Admin/Master Only) ---
export const updateContest = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { title, description, startTime, endTime, problemIds } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const contest = await Contest.findOne({ slug }).session(session);
    if (!contest) throw new ApiError(404, "Contest not found.");

    if (!title || !description || !startTime || !endTime) {
      throw new ApiError(400, "Title, description, start time, and end time are required.");
    }

    let newSlug = contest.slug;
    if (title && title !== contest.title) {
      newSlug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
      const existing = await Contest.findOne({ slug: newSlug, _id: { $ne: contest._id } }).session(session);
      if (existing) {
        throw new ApiError(400, `Another contest already exists with the title/slug '${title}'.`);
      }
      contest.title = title;
      contest.slug = newSlug;
    }

    if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
      throw new ApiError(400, "At least one problem ID is required.");
    }

    const foundProblems = await Problem.find({ _id: { $in: problemIds } }).session(session).select("_id");
    if (foundProblems.length !== problemIds.length) {
      throw new ApiError(400, "Invalid problem IDs provided.");
    }

    contest.description = description;
    contest.startTime = startTime;
    contest.endTime = endTime;
    contest.problems = problemIds.map((id) => ({ problem: id }));

    await contest.save();
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json(new ApiResponse(200, contest, "Contest updated successfully."));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw new ApiError(error.statusCode || 500, error.message || "Failed to update contest");
  }
});

// --- MANUAL RANKING CALCULATION (Admin) ---
export const calculateRanking = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  
  const contest = await Contest.findOne({ slug });
  if (!contest) throw new ApiError(404, "Contest not found.");

  const rankings = await rankingService.calculateContestRanking(contest._id, contest.startTime);

  const newRanking = await ContestRanking.findOneAndUpdate(
    { contest: contest._id },
    { contest: contest._id, rankings: rankings, calculatedAt: new Date() },
    { upsert: true, new: true }
  );

  return res.status(200).json(new ApiResponse(200, newRanking, "Rankings calculated successfully."));
});

// --- GET RANKING (Public - Decoupled Flow) ---
export const getRanking = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    
    // 1. Check the Finalized Cache first (For past contests)
    const finalizedCacheKey = `leaderboard:${slug}:final`;
    const cachedData = await redisClient.get(finalizedCacheKey);
    if (cachedData) {
        return res.status(200).json(new ApiResponse(200, JSON.parse(cachedData), "Final Leaderboard served from Cache"));
    }

    const contest = await Contest.findOne({ slug }).select("_id isRankingsFinalized").lean();
    if (!contest) throw new ApiError(404, "Contest not found.");

    // 2. If Contest is OVER and FINALIZED
    if (contest.isRankingsFinalized) {
        const savedRanking = await ContestRanking.findOne({ contest: contest._id })
            .populate("rankings.user", "name username photoUrl")
            .populate("rankings.problemResults.problem", "title slug difficulty")
            .lean();

        if (savedRanking) {
            await redisClient.set(finalizedCacheKey, JSON.stringify(savedRanking), { EX: 3600 });
            return res.status(200).json(new ApiResponse(200, savedRanking, "Final Leaderboard fetched"));
        }
    } 

    const contestIdString = contest._id.toString();

    //  3. IF CONTEST IS LIVE: Fetch the Live Redis Leaderboard
    const liveRankings = await rankingService.getLiveLeaderboard(contestIdString);
    
    return res.status(200).json(new ApiResponse(200, { 
        contest: contestIdString, 
        rankings: liveRankings 
    }, "Live Leaderboard fetched"));
});