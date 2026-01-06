import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js";
import User from "../models/userModel.js";
import ContestSubmission from "../models/contestSubmissionModel.js";
import ContestRanking from "../models/contestRankingModel.js";
import mongoose from "mongoose";
import { randomBytes } from "crypto";
import redis from "../config/redis.js";
import * as rankingService from "../services/rankingService.js";

// --- CREATE CONTEST (Admin/Master Only) ---
export const createContest = async (req, res) => {
  try {
    const { title, description, startTime, endTime, problemIds } = req.body;
    const createdBy = req.userId;

    // --- Basic Validation ---
    if (!title || !description || !startTime || !endTime) {
      return res
        .status(400)
        .json({
          message: "Title, description, start time, and end time are required.",
        });
    }

    // --- Slug Generation ---
    const slug = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "");

    // --- Check for Duplicate Title/Slug ---
    const existingContest = await Contest.findOne({
      $or: [{ title }, { slug }],
    });
    if (existingContest) {
      return res
        .status(400)
        .json({ message: "A contest with this title or slug already exists." });
    }

    // --- Validate Problems ---
    if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one problem ID is required." });
    }

    // Check if all problem IDs are valid and exist in the Problem collection
    const foundProblems = await Problem.find({
      _id: { $in: problemIds },
    }).select("_id");
    if (foundProblems.length !== problemIds.length) {
      // Find which problems were not found (for a better error message)
      const foundIds = foundProblems.map((p) => p._id.toString());
      const missingIds = problemIds.filter((id) => !foundIds.includes(id));
      return res
        .status(400)
        .json({
          message: `The following problem IDs are invalid or not found: ${missingIds.join(
            ", "
          )}`,
        });
    }

    // Format problems for the schema
    const problems = problemIds.map((id) => ({ problem: id }));

    // --- Create Contest ---
    const newContest = new Contest({
      title,
      slug,
      description,
      startTime,
      endTime,
      problems,
      createdBy,
      registeredUsers: [], // Starts empty
    });

    await newContest.save();

    return res.status(201).json(newContest);
  } catch (error) {
    console.error("Error creating contest:", error);
    return res
      .status(500)
      .json({ message: `Error creating contest: ${error.message}` });
  }
};

// --- CREATE PRIVATE CONTEST (Premium Users Only) ---
export const createPrivateContest = async (req, res) => {
  try {
    const { title, description, startTime, endTime, problemIds } = req.body;
    const createdBy = req.userId;

    if (!title || !startTime || !endTime) {
      return res
        .status(400)
        .json({ message: "Title, start time, and end time are required." });
    }

    // ---  Generate Invite Code (6 Char) ---
    const inviteCode = randomBytes(3).toString("hex").toUpperCase();

    // --- Generate Unique Slug ---
    let rawSlug = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "");
    const slug = `${rawSlug}-${inviteCode.toLowerCase()}`;

    // --- Validate Problems ---
    if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one problem ID is required." });
    }

    // Check if problems exist in DB
    const foundProblems = await Problem.find({
      _id: { $in: problemIds },
    }).select("_id");
    if (foundProblems.length !== problemIds.length) {
      const foundIds = foundProblems.map((p) => p._id.toString());
      const missingIds = problemIds.filter((id) => !foundIds.includes(id));
      return res
        .status(400)
        .json({ message: `Invalid Problem IDs: ${missingIds.join(", ")}` });
    }

    // Format for Schema
    const problems = problemIds.map((id) => ({ problem: id }));

    // --- Create Contest (Force PRIVATE) ---
    const newContest = new Contest({
      title,
      slug,
      description: description || "Private Contest",
      startTime,
      endTime,
      problems,
      createdBy,
      visibility: "PRIVATE",
      inviteCode: inviteCode,
      registeredUsers: [],
    });

    await newContest.save();

    return res.status(201).json({
      message: "Private contest created successfully",
      contestId: newContest._id,
      inviteCode: newContest.inviteCode,
      slug: newContest.slug,
    });
  } catch (error) {
    console.error("Error creating private contest:", error);
    return res
      .status(500)
      .json({ message: `Error creating contest: ${error.message}` });
  }
};

// --- UPDATE PRIVATE CONTEST (User Only) ---
export const updatePrivateContest = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, description, startTime, endTime, problemIds } = req.body;
    const userId = req.userId;

    //  Find the contest
    const contest = await Contest.findOne({ slug });
    if (!contest) return res.status(404).json({ message: "Contest not found" });

    //  OWNERSHIP CHECK (Crucial)
    if (contest.createdBy.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You do not have permission to edit this contest." });
    }

    //  TIME CHECK (Integrity)
    if (new Date() >= new Date(contest.startTime)) {
      return res
        .status(400)
        .json({ message: "Cannot edit a contest that has already started." });
    }

    //  Validate Problems
    if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one problem ID is required." });
    }

    // Check if problems exist in DB
    const foundProblems = await Problem.find({
      _id: { $in: problemIds },
    }).select("_id");
    if (foundProblems.length !== problemIds.length) {
      const foundIds = foundProblems.map((p) => p._id.toString());
      const missingIds = problemIds.filter((id) => !foundIds.includes(id));
      return res
        .status(400)
        .json({ message: `Invalid Problem IDs: ${missingIds.join(", ")}` });
    }

    // 5. Update Fields
    contest.title = title || contest.title;
    contest.description = description || contest.description;
    contest.startTime = startTime || contest.startTime;
    contest.endTime = endTime || contest.endTime;

    if (problemIds && problemIds.length > 0) {
      contest.problems = problemIds.map((id) => ({ problem: id }));
    }

    await contest.save();

    res.json({ message: "Contest updated successfully", contest });
  } catch (error) {
    console.error("Update Private Contest Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// --- GET ALL CONTESTS (Public) ---
export const getAllContests = async (req, res) => {
  try {
    const now = new Date();

    // Fetch all contests, split into categories
    const allContests = await Contest.find({})
      .select("title slug description startTime endTime")
      .sort({ startTime: -1 }); // Newest start times first

    // Categorize them
    const upcoming = allContests.filter((c) => new Date(c.startTime) > now);
    const live = allContests.filter(
      (c) => new Date(c.startTime) <= now && new Date(c.endTime) > now
    );
    const past = allContests.filter((c) => new Date(c.endTime) <= now);

    return res.status(200).json({ upcoming, live, past });
  } catch (error) {
    console.error("Error fetching contests:", error);
    return res
      .status(500)
      .json({ message: `Error fetching contests: ${error.message}` });
  }
};

// --- GET SINGLE CONTEST DETAILS (Auth User) ---
export const getContestDetails = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.userId;

    //  Find the contest and populate its problems in one query
    const contest = await Contest.findOne({ slug: slug }).populate({
      path: "problems.problem",
      select: "title slug difficulty tags isPremium",
    });

    if (!contest) {
      return res.status(404).json({ message: "Contest not found." });
    }

    //  Safely check if the user is registered.
    let isRegistered = false;
    if (userId && contest.registeredUsers) {
      isRegistered = contest.registeredUsers.some((id) => id.equals(userId));
    }

    //  Convert to a plain object to add/remove fields
    const contestObject = contest.toObject();

    //  Add our new 'isRegistered' field
    contestObject.isRegistered = isRegistered;

    //  Securely remove the full list of registered users before sending
    delete contestObject.registeredUsers;

    return res.status(200).json(contestObject);
  } catch (error) {
    console.error("Error fetching contest details:", error);
    return res
      .status(500)
      .json({ message: `Error fetching details: ${error.message}` });
  }
};

// --- REGISTER FOR CONTEST (Auth User) ---
export const registerForContest = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.userId;

    const contest = await Contest.findOne({ slug: slug });
    if (!contest) {
      return res.status(404).json({ message: "Contest not found." });
    }

    if (new Date(contest.startTime) <= new Date()) {
      return res
        .status(400)
        .json({
          message:
            "Registration is closed. This contest is already live or has ended.",
        });
    }

    if (contest.registeredUsers.includes(userId)) {
      return res
        .status(400)
        .json({ message: "You are already registered for this contest." });
    }

    const visibility = contest.visibility ? contest.visibility.toUpperCase() : "PUBLIC";

    if (visibility === "PRIVATE") {

      const { inviteCode } = req.body;

      if (!inviteCode || inviteCode !== contest.inviteCode) {
        return res
          .status(403)
          .json({ message: "Invalid or missing invite code" });
      }
    }

    contest.registeredUsers.push(userId);
    await contest.save();

    return res
      .status(200)
      .json({ message: "Successfully registered for the contest!" });
  } catch (error) {
    console.error("Error registering for contest:", error);
    return res
      .status(500)
      .json({ message: `Error registering: ${error.message}` });
  }
};

// --- DELETE CONTEST (Admin/Master Only) ---
export const deleteContest = async (req, res) => {
  const { slug } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const contest = await Contest.findOneAndDelete({ slug: slug }).session(
      session
    );
    if (!contest) {
      await session.commitTransaction();
      session.endSession();
      return res.status(404).json({ message: "Contest not found." });
    }

    // Optional: Delete associated contest submissions
    await ContestSubmission.deleteMany({ contest: contest._id }).session(
      session
    );

    await session.commitTransaction();
    session.endSession();
    return res.status(200).json({ message: "Contest deleted successfully." });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting contest:", error);
    return res
      .status(500)
      .json({ message: `Error deleting contest: ${error.message}` });
  }
};

// --- UPDATE CONTEST (Admin/Master Only) ---
export const updateContest = async (req, res) => {
  const { slug } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { title, description, startTime, endTime, problemIds } = req.body;
    const updatedBy = req.userId;

    // --- Find the existing contest ---
    const contest = await Contest.findOne({ slug: slug }).session(session);
    if (!contest) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Contest not found." });
    }

    // --- Basic Validation ---
    if (!title || !description || !startTime || !endTime) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          message: "Title, description, start time, and end time are required.",
        });
    }

    // --- Handle Title/Slug Change ---
    let newSlug = contest.slug;
    if (title && title !== contest.title) {
      newSlug = title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "");
      // Check if new slug is taken by *another* contest
      const existing = await Contest.findOne({
        slug: newSlug,
        _id: { $ne: contest._id },
      }).session(session);
      if (existing) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({
            message: `Another contest already exists with the title/slug '${title}'.`,
          });
      }
      contest.title = title;
      contest.slug = newSlug;
    }

    // --- Validate Problems ---
    if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "At least one problem ID is required." });
    }

    const foundProblems = await Problem.find({ _id: { $in: problemIds } })
      .session(session)
      .select("_id");
    if (foundProblems.length !== problemIds.length) {
      const foundIds = foundProblems.map((p) => p._id.toString());
      const missingIds = problemIds.filter((id) => !foundIds.includes(id));
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: `Invalid problem IDs: ${missingIds.join(", ")}` });
    }

    // Format problems for the schema
    const problems = problemIds.map((id) => ({ problem: id }));

    // --- Update Contest Fields ---
    contest.description = description;
    contest.startTime = startTime;
    contest.endTime = endTime;
    contest.problems = problems;
    // createdBy remains the same, but you could add an 'updatedBy' field if you want

    await contest.save();

    // --- Commit and Send ---
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json(contest);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating contest:", error);
    return res
      .status(500)
      .json({ message: `Error updating contest: ${error.message}` });
  }
};

// --- MANUAL RANKING CALCULATION (Admin) ---
export const calculateRanking = async (req, res) => {
  const { slug } = req.params;
  try {
    const contest = await Contest.findOne({ slug });
    if (!contest)
      return res.status(404).json({ message: "Contest not found." });

    // 1. Calculate using Service
    const rankings = await rankingService.calculateContestRanking(
      contest._id,
      contest.startTime
    );

    // 2. Save permanently to DB
    const newRanking = await ContestRanking.findOneAndUpdate(
      { contest: contest._id },
      {
        contest: contest._id,
        rankings: rankings,
        calculatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.status(200).json(newRanking);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// --- GET RANKING (Public - radis Optimized Hybrid Flow) ---
export const getRanking = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `leaderboard:${slug}`;

    // 1. REDIS CHECK (Fastest)
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      console.log(" Serving Leaderboard from Redis");
      return res.status(200).json(JSON.parse(cachedData));
    }

    console.log(" Calculating/Fetching Leaderboard from DB...");

    const contest = await Contest.findOne({ slug });
    if (!contest) return res.status(404).json({ message: "Contest not found." });

    let responseData;
    let cacheTTL; 

    //  DECIDE SOURCE: ARCHIVE vs LIVE
    if (contest.isRankingsFinalized) {
      // --- A. ARCHIVED FLOW (Past Contest) ---
      // Fetch from ContestRanking collection (Cheap)
      const savedRanking = await ContestRanking.findOne({ contest: contest._id })
        .populate("rankings.user", "name username photoUrl")
        .populate("rankings.problemResults.problem", "title slug difficulty");

      responseData = savedRanking;
      cacheTTL = 3600; // 1 Hour (It won't change)
    } 
    else {
      // --- B. LIVE FLOW (Active Contest) ---
      // Calculate from Submissions (Expensive)
      const liveRankings = await rankingService.calculateContestRanking(
        contest._id,
        contest.startTime
      );

      // Populate manually for Live Objects
      await User.populate(liveRankings, {
        path: "user",
        select: "name username photoUrl",
      });

      await Problem.populate(liveRankings, {
        path: "problemResults.problem",
        select: "title slug difficulty",
      });

      responseData = {
        contest: contest._id,
        rankings: liveRankings,
      };
      cacheTTL = 10; // 10 Seconds (Real-time updates)
    }

    // 3. SAVE TO REDIS
    if (responseData) {
        await redis.set(cacheKey, JSON.stringify(responseData), "EX", cacheTTL);
    }

    return res.status(200).json(responseData);

  } catch (error) {
    console.error("Error fetching ranking:", error);
    return res.status(500).json({ message: error.message });
  }
};

