import mongoose from "mongoose";
import Submission from "../models/submissionModel.js";
import Problem from "../models/problemModel.js";
import { dispatchQueue } from "../config/queue.js";
import redisClient from "../config/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const createSubmission = asyncHandler(async (req, res) => {
    const { slug, language, code } = req.body;
    const userId = req.userId;

    if (!code || code.length > 20000) throw new ApiError(413, "Code exceeds 20KB limit.");

    // FIX : Circuit Breaker Check
    const circuitOpen = await redisClient.get("circuit_breaker:judge0");
    if (circuitOpen) {
        throw new ApiError(503, "Execution engine is temporarily pausing to recover. Try again in 30s.");
    }

    // FIX : Queue Backpressure Guard (Max Depth)
    const waitingCount = await dispatchQueue.getWaitingCount();
    if (waitingCount > 5000) {
        throw new ApiError(503, "System is at maximum capacity. Please try again shortly.");
    }

    // FIX : Atomic Rate Limiting (Redis MULTI)
    const rateKey = `rate:sub:${userId}`;
    const multiResponse = await redisClient.multi()
        .incr(rateKey)
        .expire(rateKey, 60, 'NX') 
        .exec();
    
    const subsCount = multiResponse[0][1]; 
    if (subsCount > 10) throw new ApiError(429, "Too many submissions. Please wait a minute.");

    const problem = await Problem.findOne({ slug, isDeleted: { $ne: true } }).select("_id").lean();
    if (!problem) throw new ApiError(404, "Problem not found.");

    // FIX : Relies on the Partial Unique Index in MongoDB
    // 
    let newSubmission;
    try {
        newSubmission = await Submission.create({
            user: userId, problem: problem._id, code, language, status: "Queued"
        });
    } catch (error) {
        if (error.code === 11000) throw new ApiError(429, "You already have an evaluation in progress for this problem.");
        throw error;
    }

    // Enqueue
    try {
        await dispatchQueue.add("dispatch-judge", {
            submissionId: newSubmission._id, code, language, slug, userId
        }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
    } catch (error) {
        await Submission.findByIdAndUpdate(newSubmission._id, { status: "Internal Error" });
        throw new ApiError(503, "Failed to enqueue submission.");
    }

    return res.status(201).json({ success: true, submissionId: newSubmission._id });
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