import mongoose from "mongoose";
import Submission from "../models/submissionModel.js";
import Problem from "../models/problemModel.js";
import { dispatchQueue } from "../config/queue.js";
import redisClient from "../config/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

//  language enforcement 
const ALLOWED_LANGUAGES = ["cpp", "java", "python"];

// --- CREATE SUBMISSION (Practice Mode) ---
export const createSubmission = asyncHandler(async (req, res) => {
    const { slug, language, code } = req.body;
    const userId = req.userId;

    //  Validate Slug Format 
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
        throw new ApiError(400, "Invalid problem slug format.");
    }

    // 2. Normalize and Validate Language
    const normalizedLanguage = language?.toLowerCase().trim();
    if (!normalizedLanguage || !ALLOWED_LANGUAGES.includes(normalizedLanguage)) {
        throw new ApiError(400, `Unsupported language. Allowed: ${ALLOWED_LANGUAGES.join(", ")}`);
    }

    //  Normalize and Validate Code
    const trimmedCode = code?.trim();
    if (!trimmedCode || trimmedCode.length < 5) {
        throw new ApiError(400, "Code is too short or empty.");
    }
    if (trimmedCode.length > 20000) {
        throw new ApiError(413, "Code exceeds 20KB limit.");
    }

    //  Circuit Breaker Check
    const circuitOpen = await redisClient.get("circuit_breaker:judge0");
    if (circuitOpen) {
        throw new ApiError(503, "Execution engine is temporarily pausing to recover. Try again in 30s.");
    }

    // Queue Backpressure Guard (Max Depth)
    const waitingCount = await dispatchQueue.getWaitingCount();
    if (waitingCount > 5000) {
        throw new ApiError(503, "System is at maximum capacity. Please try again shortly.");
    }

    //  Atomic Rate Limiting (Redis MULTI)
    const rateKey = `rate:sub:${userId}`;
    const multiResponse = await redisClient.multi()
        .incr(rateKey)
        .expire(rateKey, 60, 'NX') 
        .exec();
    
    const subsCount = multiResponse[0][1]; 
    if (subsCount > 10) {
        throw new ApiError(429, "Too many submissions. Please wait a minute.");
    }

    //  Validate Problem Existence
    const problem = await Problem.findOne({ slug, isDeleted: { $ne: true } }).select("_id").lean();
    if (!problem) throw new ApiError(404, "Problem not found.");

    //  DB Insertion (Relies on the Partial Unique Index in MongoDB for concurrency)
    let newSubmission;
    try {
        newSubmission = await Submission.create({
            user: userId, 
            problem: problem._id, 
            code: trimmedCode, 
            language: normalizedLanguage, 
            status: "Queued"
        });
    } catch (error) {
        if (error.code === 11000) {
            throw new ApiError(429, "You already have an evaluation in progress for this problem.");
        }
        throw error;
    }

    //  Enqueue to Dispatcher
    try {
        await dispatchQueue.add("dispatch-judge", {
            submissionId: newSubmission._id.toString(), // Safely cast ObjectId to string for BullMQ
            code: trimmedCode, 
            language: normalizedLanguage, 
            slug, 
            userId
        }, { 
            attempts: 3, 
            backoff: { type: 'exponential', delay: 1000 } 
        });
    } catch (error) {
        await Submission.findByIdAndUpdate(newSubmission._id, { status: "Internal Error" });
        throw new ApiError(503, "Failed to enqueue submission.");
    }

    return res.status(201).json(new ApiResponse(201, { submissionId: newSubmission._id }, "Submission queued successfully"));
});


// ---  GET SUBMISSION STATUS (Fallback Polling) ---
export const getSubmissionStatus = asyncHandler(async (req, res) => {
    const { submissionId } = req.params;
    
    const submission = await Submission.findOne({ _id: submissionId, user: req.userId })
        .select("-code -judge0Tokens") 
        .lean();

    if (!submission) throw new ApiError(404, "Submission not found.");
    
    return res.status(200).json(new ApiResponse(200, submission));
});

// ---  GET SUBMISSION HISTORY FOR PROBLEM PAGE ---
export const getSubmissionsForProblem = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    
    const problem = await Problem.findOne({ slug, isDeleted: { $ne: true } }).select("_id").lean();
    if (!problem) throw new ApiError(404, "Problem not found.");

    const submissions = await Submission.find({
        problem: problem._id,
        user: req.userId
    })
    .select("status language createdAt score executionTime memoryUsed") 
    .sort({ createdAt: -1 }) 
    .limit(50) 
    .lean();

    return res.status(200).json(new ApiResponse(200, submissions));
});