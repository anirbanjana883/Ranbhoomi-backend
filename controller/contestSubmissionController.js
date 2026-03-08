import ContestSubmission from "../models/contestSubmissionModel.js";
import ContestRegistration from "../models/contestRegistrationModel.js"; 
import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js";
import { contestDispatchQueue } from "../config/queue.js"; 
import redisClient from "../config/redis.js"; 

// --- IMPORT UTILITIES ---
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// --- CREATE CONTEST SUBMISSION (Producer) ---
export const createContestSubmission = asyncHandler(async (req, res) => {
    const { slug, problemSlug, language, code } = req.body;
    const userId = req.userId;

    if (!language || !code || !slug || !problemSlug) {
        throw new ApiError(400, "Contest, problem, language, and code are required.");
    }
    if (code.length > 20000) throw new ApiError(413, "Code exceeds 20KB limit.");

    // 🛡️ 1. Circuit Breaker & Backpressure Guard
    const circuitOpen = await redisClient.get("circuit_breaker:judge0");
    if (circuitOpen) throw new ApiError(503, "Execution engine is temporarily pausing. Try again in 30s.");

    const waitingCount = await contestDispatchQueue.getWaitingCount();
    if (waitingCount > 5000) throw new ApiError(503, "System is at maximum capacity. Please try again shortly.");

    // 🛡️ 2. REDIS MUTEX LOCK: Double-Click Protection
    const lockKey = `lock:submit:${userId}:${problemSlug}`;
    const acquired = await redisClient.set(lockKey, "locked", { NX: true, EX: 5 });
    if (!acquired) throw new ApiError(429, "Please wait before submitting again.");

    try {
        // --- Contest Time & Existence Validation ---
        const contest = await Contest.findOne({ slug }).select("_id startTime endTime problems").lean();
        if (!contest) throw new ApiError(404, "Contest not found.");

        const now = new Date(); 
        if (now < new Date(contest.startTime)) throw new ApiError(400, "Contest has not started.");
        if (now > new Date(contest.endTime)) throw new ApiError(400, "Contest has ended. Submissions are closed.");

        // O(1) Registration Check
        const isRegistered = await ContestRegistration.exists({ user: userId, contest: contest._id });
        if (!isRegistered) throw new ApiError(403, "You are not registered for this contest.");

        // Problem Validation
        const problem = await Problem.findOne({ slug: problemSlug }).select("_id score").lean();
        if (!problem) throw new ApiError(404, "Problem not found.");
        
        const isProblemInContest = contest.problems.some(p => p.problem.toString() === problem._id.toString());
        if (!isProblemInContest) throw new ApiError(400, "This problem is not part of this contest.");

        // 🧠 3. CODE HASHING & CACHING (The LeetCode Trick)
        const hashPayload = `${code}-${language}`;
        const codeHash = crypto.createHash("sha256").update(hashPayload).digest("hex");
        
        // 🚨 IMPORTANT: Make sure this key matches the key saved in contestPollingWorker exactly!
        const cacheKey = `cache:sub:${problem._id}:${codeHash}`;
        
        const cachedResultStr = await redisClient.get(cacheKey);

        if (cachedResultStr) {
            // ⚡ CACHE HIT! Bypass BullMQ and Judge0 entirely
            const cachedResult = JSON.parse(cachedResultStr);
            
            const newSubmission = await ContestSubmission.create({
                user: userId,
                problem: problem._id,
                contest: contest._id, 
                code,
                language,
                status: cachedResult.status,
                score: cachedResult.score,
                executionTime: cachedResult.executionTime,
                memoryUsed: cachedResult.memoryUsed,
                results: cachedResult.results,
                submissionTime: now
            });

            // 🏆 Update Leaderboard
            await updateLeaderboard(
                contest._id, userId, problemSlug, 
                cachedResult.status, cachedResult.score, now
            );

            // 📡 🔥 FIX: PUBLISH TO WEBSOCKETS SO UI UPDATES INSTANTLY!
            await connection.publish("submission-events", JSON.stringify({
                userId, 
                submissionId: newSubmission._id, 
                status: cachedResult.status,
                score: cachedResult.score
            }));

            // Release lock
            await redisClient.del(lockKey);

            return res.status(200).json(new ApiResponse(200, newSubmission, "Submission evaluated instantly (Cached)"));
        }

        // 🚦 4. CREATE QUEUED SUBMISSION
        const newSubmission = await ContestSubmission.create({
            user: userId,
            problem: problem._id,
            contest: contest._id, 
            code,
            language,
            status: "Queued", 
            judge0Tokens: [],
            results: [],
            score: 0,
            submissionTime: now
        });

        // 🔥 5. PUSH TO ISOLATED CONTEST QUEUE
        await contestDispatchQueue.add("process-contest-submission", {
            submissionId: newSubmission._id,
            code,
            language,
            slug: problemSlug, 
            userId,
            isContest: true,       
            contestId: contest._id 
        }, { 
            jobId: newSubmission._id.toString(), // BullMQ deduplication
            attempts: 3, 
            backoff: { type: 'exponential', delay: 1000 } 
        });

        return res.status(201).json(new ApiResponse(201, newSubmission, "Submission Queued for Evaluation"));

    } catch (error) {
        await redisClient.del(lockKey); 
        throw new ApiError(error.statusCode || 500, error.message || "Submission failed");
    }
});

// --- GET CONTEST SUBMISSION STATUS (Read-Only Poller) ---
export const getContestSubmissionStatus = asyncHandler(async (req, res) => {
    const { submissionId } = req.params; 
    const userId = req.userId;

    // Use .lean() for fast read performance
    const submission = await ContestSubmission.findOne({ _id: submissionId, user: userId }).lean();
    if (!submission) throw new ApiError(404, "Contest submission not found.");

    return res.status(200).json(new ApiResponse(200, submission, "Submission status fetched successfully"));
});

// --- GET ALL SUBMISSIONS FOR A PROBLEM ---
export const getSubmissionsForProblem = asyncHandler(async (req, res) => {
    const { slug } = req.params; 
    const userId = req.userId;   
    
    // Lean query just to get the ID
    const problem = await Problem.findOne({ slug }).select("_id").lean();
    if (!problem) throw new ApiError(404, "Problem not found.");

    // History fetch using Lean and Projection for speed
    const submissions = await ContestSubmission.find({ problem: problem._id, user: userId })
        .select("status language score createdAt executionTime memoryUsed") 
        .sort({ createdAt: -1 })
        .lean(); 

    return res.status(200).json(new ApiResponse(200, submissions, "Submissions history fetched successfully"));
});