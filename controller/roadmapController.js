import RoadmapTemplate from '../models/roadmapTemplateModel.js';
import UserProgress from '../models/userProgressModel.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// GET ALL ROADMAPS
// Optimization: Strict projection to minimize network payload
export const getAllRoadmaps = asyncHandler(async (req, res) => {
    const roadmaps = await RoadmapTemplate.find({})
        .select('roadmapId title category description -_id') 
        .lean();

    return res.status(200).json(
        new ApiResponse(200, roadmaps, "Roadmap list fetched successfully")
    );
});

//  GET ROADMAP & USER PROGRESS
// Optimization: Parallel execution & Strict `.select()` projection
export const getRoadmapData = asyncHandler(async (req, res) => {
    const { roadmapId } = req.params;
    const userId = req.userId;

    if (!userId) throw new ApiError(401, "Unauthorized access.");

    const [template, progress] = await Promise.all([
        RoadmapTemplate.findOne({ roadmapId }).lean(),
        UserProgress.findOne({ userId, roadmapId })
            .select("solved bookmarked notes stats activeDays") // Stripped unnecessary data
            .lean()
    ]);

    if (!template) {
        throw new ApiError(404, "Roadmap template not found.");
    }

    const userState = progress || {
        solved: {}, bookmarked: {}, notes: {},
        stats: { totalSolved: 0, easy: 0, medium: 0, hard: 0 },
        activeDays: {}
    };

    return res.status(200).json(
        new ApiResponse(200, { template, progress: userState }, "Roadmap data fetched")
    );
});

//  TOGGLE SOLVED STATUS
// Optimization: Difficulty Validation & Safer $inc bounds
export const toggleSolvedStatus = asyncHandler(async (req, res) => {
    const { roadmapId } = req.params;
    const { questionId, difficulty } = req.body;
    const userId = req.userId;

    if (!questionId || !roadmapId) {
        throw new ApiError(400, "Roadmap ID and Question ID are required");
    }

    // Safety: Prevent arbitrary payload injection into the stats object
    const allowedDiffs = ["basic", "easy", "medium", "hard"];
    const diffKey = allowedDiffs.includes(difficulty?.toLowerCase()) 
        ? difficulty.toLowerCase() 
        : "medium";

    const today = new Date().toISOString().split('T')[0];

    // Fetch ONLY the specific question's current state and today's activity
    const currentProgress = await UserProgress.findOne(
        { userId, roadmapId }, 
        { [`solved.${questionId}`]: 1, [`activeDays.${today}`]: 1 }
    ).lean();

    const isCurrentlySolved = currentProgress?.solved?.[questionId];
    
    // Build the Atomic Update Query
    const updateQuery = {};
    
    // Toggle the specific question key
    if (isCurrentlySolved) {
        updateQuery.$unset = { [`solved.${questionId}`]: 1 };
    } else {
        updateQuery.$set = { [`solved.${questionId}`]: true };
    }

    // Safety: Safer $inc logic to prevent negative drops on rapid UI retries
    updateQuery.$inc = { 
        "stats.totalSolved": isCurrentlySolved ? -1 : 1, 
        [`stats.${diffKey}`]: isCurrentlySolved ? -1 : 1,
        [`activeDays.${today}`]: isCurrentlySolved 
            ? (currentProgress?.activeDays?.[today] > 0 ? -1 : 0) 
            : 1
    };

    const updatedProgress = await UserProgress.findOneAndUpdate(
        { userId, roadmapId },
        updateQuery,
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json(
        new ApiResponse(200, { 
            isSolved: !isCurrentlySolved, 
            stats: updatedProgress.stats, 
            activeDays: updatedProgress.activeDays 
        }, "Question status updated")
    );
});

// TOGGLE BOOKMARK / PIN
export const toggleBookmark = asyncHandler(async (req, res) => {
    const { roadmapId } = req.params;
    const { questionId } = req.body;
    const userId = req.userId;

    if (!questionId || !roadmapId) throw new ApiError(400, "Missing parameters");

    const current = await UserProgress.findOne({ userId, roadmapId }, { [`bookmarked.${questionId}`]: 1 }).lean();
    const isBookmarked = current?.bookmarked?.[questionId];

    const updateQuery = isBookmarked 
        ? { $unset: { [`bookmarked.${questionId}`]: 1 } }
        : { $set: { [`bookmarked.${questionId}`]: true } };

    await UserProgress.findOneAndUpdate(
        { userId, roadmapId }, 
        updateQuery, 
        { upsert: true }
    );

    return res.status(200).json(
        new ApiResponse(200, { isBookmarked: !isBookmarked }, "Bookmark toggled")
    );
});

// SAVE QUESTION NOTE
// Optimization: Zero-read update.
export const saveNote = asyncHandler(async (req, res) => {
    const { roadmapId } = req.params;
    const { questionId, noteText } = req.body;
    const userId = req.userId;

    if (!questionId || !roadmapId) throw new ApiError(400, "Missing parameters");

    const updateQuery = (!noteText || noteText.trim() === "")
        ? { $unset: { [`notes.${questionId}`]: 1 } }
        : { $set: { [`notes.${questionId}`]: noteText } };

    await UserProgress.findOneAndUpdate(
        { userId, roadmapId },
        updateQuery,
        { upsert: true }
    );

    return res.status(200).json(
        new ApiResponse(200, null, "Note saved successfully")
    );
});