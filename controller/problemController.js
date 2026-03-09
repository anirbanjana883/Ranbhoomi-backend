import mongoose from "mongoose";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import Submission from "../models/submissionModel.js";
import User from "../models/userModel.js";
import { generateProblemCodes } from "../utils/codeGenerator.js";

import {
  ALLOWED_PROBLEM_TAGS,
  normalizeProblemTag,
} from "../config/problemTags.js";
import {
  ALLOWED_COMPANY_TAGS,
  normalizeCompanyTag,
} from "../config/companyTags.js";
import redisClient from "../config/redis.js"; 
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";


// FAANG Transaction Options
const txnOptions = {
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" }
};

// ---  GET ALL PROBLEMS (Pagination, Text Index, Lean) --- 
export const getAllProblems = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const { difficulty, tags, company, search } = req.query;
    const filter = { 
        isPublished: true, 
        isDeleted: { $ne: true } 
    }; 

    if (difficulty && ["Easy", "Medium", "Hard", "Super Hard"].includes(difficulty)) {
        filter.difficulty = difficulty;
    }
    if (tags) {
        const tagsArray = tags.split(",").map(tag => tag.trim().toLowerCase());
        filter.tags = { $all: tagsArray };
    }
    if (company) filter.companyTags = company.trim().toLowerCase();
    
    // Uses the text index (O(log N)) instead of regex (O(N) COLLSCAN)
    if (search) filter.$text = { $search: search }; 

    const problems = await Problem.find(filter)
        .select("title slug difficulty tags companyTags createdAt isPremium executionStats")
        .sort({ isPublished: 1, createdAt: -1 }) 
        .skip(skip)
        .limit(limit)
        .lean(); 

    return res.status(200).json(new ApiResponse(200, problems));
});

// ---  GET ALL PROBLEMS (Admin Only) --- 
export const getAllProblemsAdmin = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; 
    const skip = (page - 1) * limit;

    const { difficulty, tags, company, search } = req.query;
    const filter = { 
        isDeleted: { $ne: true } 
    }; 

    if (difficulty && ["Easy", "Medium", "Hard", "Super Hard"].includes(difficulty)) filter.difficulty = difficulty;
    if (tags) filter.tags = { $all: tags.split(",").map(tag => tag.trim().toLowerCase()) };
    if (company) filter.companyTags = company.trim().toLowerCase();
    if (search) filter.$text = { $search: search }; 

    const problems = await Problem.find(filter)
        .select("title slug difficulty tags companyTags createdAt isPremium isPublished executionStats")
        .sort({ isDeleted: 1, createdAt: -1 }) 
        .skip(skip)
        .limit(limit)
        .lean(); 

    return res.status(200).json(new ApiResponse(200, problems));
});

// ---  GET problem by slug  ---  
export const getProblemBySlug = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const cacheKey = `problem:${slug}`;

    let cachedProblem = await redisClient.get(cacheKey);
    if (cachedProblem) {
        return res.status(200).json(new ApiResponse(200, cachedProblem));
    }

    //  Cache Miss
    const lockKey = `lock:problem:${slug}`;
    const gotLock = await redisClient.set(lockKey, "1", { nx: true, ex: 5 }); 

    if (!gotLock) {
        // Poll every 50ms, up to 4 times (200ms total wait)
        for (let i = 0; i < 4; i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
            cachedProblem = await redisClient.get(cacheKey);
            if (cachedProblem) {
                return res.status(200).json(new ApiResponse(200, cachedProblem));
            }
        }
    }

    // DB Fetch 
    const problem = await Problem.findOne({ slug, isDeleted: { $ne: true } })
        .populate({
            path: "testCases",
            match: { isSample: true },
            select: "input expectedOutput _id",
        })
        .select("-solution -driverCode")
        .lean();

    if (!problem) {
        throw new ApiError(404, "Problem not found");
    }

    // Cache and Release Lock 
    if (gotLock) {
    await redisClient.set(cacheKey, JSON.stringify(problem), { ex: 600 }); 
    await redisClient.del(lockKey);
}

    return res.status(200).json(new ApiResponse(200, problem));
});

// ---  GET SINGLE PROBLEM FOR EDITING (Admin Only) ---
export const getProblemForEdit = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    
    //  FIX: Changed 'false' to '{ $ne: true }' to catch older documents!
    const problem = await Problem.findOne({ slug, isDeleted: { $ne: true } })
        .populate({
            path: "testCases",
            select: "input expectedOutput isSample createdAt" 
        })
        .lean(); 

    if (!problem) throw new ApiError(404, "Problem not found");
    
    return res.status(200).json(new ApiResponse(200, problem));
});

// --- CREATE PROBLEM (Strict DSL Generation Mode) (Admin/Master Only) ---
export const createProblem = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    let createdProblem;

    await session.withTransaction(async () => {
        const { 
            title, description, difficulty, tags, companyTags, 
            signature, testCasesData, solution, 
            isPremium, isPublished, originContest,
            timeLimit, memoryLimit 
        } = req.body;

        // siggnature validation
        if (!signature || !signature.functionName || !signature.returnType || !Array.isArray(signature.parameters)) {
            throw new ApiError(400, "Problem signature (functionName, returnType, parameters) is strictly required to auto-generate execution code.");
        }

        const { starterCode, driverCode } = generateProblemCodes(signature);

        if (!title || !description || !difficulty || !testCasesData || !Array.isArray(testCasesData) || testCasesData.length === 0) {
            throw new ApiError(400, "Missing required fields: title, description, difficulty, and at least one test case.");
        }

        // Validate & Normalize Problem Tags
        let validatedTags = [];
        if (tags && Array.isArray(tags)) {
            validatedTags = tags.map(tag => normalizeProblemTag(tag)).filter(tag => tag !== null);
            const invalidTags = validatedTags.filter(tag => !ALLOWED_PROBLEM_TAGS.includes(tag));
            if (invalidTags.length > 0) throw new ApiError(400, `Invalid problem tags: ${invalidTags.join(", ")}`);
        } else if (tags) throw new ApiError(400, "Problem tags must be an array.");

        // Validate & Normalize Company Tags
        let validatedCompanyTags = [];
        if (companyTags && Array.isArray(companyTags)) {
            validatedCompanyTags = companyTags.map(tag => normalizeCompanyTag(tag)).filter(tag => tag !== null);
            const invalidCompanies = validatedCompanyTags.filter(tag => !ALLOWED_COMPANY_TAGS.includes(tag));
            if (invalidCompanies.length > 0) throw new ApiError(400, `Invalid company tags: ${invalidCompanies.join(", ")}`);
        } else if (companyTags) throw new ApiError(400, "Company tags must be an array.");

        // Generate Slug & Check Duplicates
        const generatedSlug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
        const existingProblem = await Problem.findOne({ $or: [{ title }, { slug: generatedSlug }] }).session(session);
        if (existingProblem) {
            const field = existingProblem.title === title ? "title" : "slug";
            throw new ApiError(400, `A problem with this ${field} already exists.`);
        }

        // Create Problem Doc (Dynamically attaches the compiled code)
        const newProblem = new Problem({
            title, slug: generatedSlug, description, difficulty,
            tags: validatedTags, companyTags: validatedCompanyTags,
            signature, timeLimit: timeLimit || 2.0, memoryLimit: memoryLimit || 256000,
            starterCode, driverCode, solution: solution || "",
            isPremium: isPremium || false, isPublished: isPublished,
            originContest: originContest || null, testCases: []
        });
        await newProblem.save({ session });

        // Create & Link TestCases
        const testCaseDocsData = testCasesData.map(tc => ({
            problem: newProblem._id, input: tc.input, expectedOutput: tc.expectedOutput, isSample: tc.isSample || false
        }));
        const createdTestCases = await TestCase.insertMany(testCaseDocsData, { session });
        
        newProblem.testCases = createdTestCases.map(tc => tc._id);
        await newProblem.save({ session });

        createdProblem = newProblem;
    });

    session.endSession();
    return res.status(201).json(new ApiResponse(201, createdProblem, "Problem Created Successfully"));
});

// --- UPDATE PROBLEM DETAILS (Strict DSL Generation Mode) (Admin/Master Only)---
export const updateProblem = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const session = await mongoose.startSession();
    let updatedProblem;
    let oldSlugToDelete = null;

    await session.withTransaction(async () => {
        const problem = await Problem.findOne({ slug, isDeleted: { $ne: true } }).session(session);
        if (!problem) throw new ApiError(404, "Problem not found");

        const { 
            title, description, difficulty, tags, companyTags, 
            signature, solution, 
            isPremium, isPublished, timeLimit, memoryLimit 
        } = req.body;

        //  Title/Slug Change & Duplication Check
        if (title && title !== problem.title) {
            const newSlug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
            const existing = await Problem.findOne({ slug: newSlug, _id: { $ne: problem._id } }).session(session);
            if (existing) throw new ApiError(400, `Another problem exists with slug '${newSlug}'.`);
            
            oldSlugToDelete = problem.slug;
            problem.title = title;
            problem.slug = newSlug;
        }

        // Validate & Normalize Tags
        if (tags !== undefined) {
            if (!Array.isArray(tags)) throw new ApiError(400, "Problem tags must be an array.");
            const validatedTags = tags.map(tag => normalizeProblemTag(tag)).filter(tag => tag !== null);
            const invalidTags = validatedTags.filter(tag => !ALLOWED_PROBLEM_TAGS.includes(tag));
            if (invalidTags.length > 0) throw new ApiError(400, `Invalid problem tags: ${invalidTags.join(", ")}`);
            problem.tags = validatedTags;
        }

        // Validate & Normalize Company Tags
        if (companyTags !== undefined) {
            if (!Array.isArray(companyTags)) throw new ApiError(400, "Company tags must be an array.");
            const validatedCompanyTags = companyTags.map(tag => normalizeCompanyTag(tag)).filter(tag => tag !== null);
            const invalidCompanies = validatedCompanyTags.filter(tag => !ALLOWED_COMPANY_TAGS.includes(tag));
            if (invalidCompanies.length > 0) throw new ApiError(400, `Invalid company tags: ${invalidCompanies.join(", ")}`);
            problem.companyTags = validatedCompanyTags;
        }

        //  Auto-Regenerate Code if Signature is Passed
        if (signature && signature.functionName) {
            const { starterCode, driverCode } = generateProblemCodes(signature);
            problem.signature = signature;
            problem.starterCode = starterCode;
            problem.driverCode = driverCode;
        }

        // Update Other Fields
        if (description !== undefined) problem.description = description;
        if (difficulty !== undefined) problem.difficulty = difficulty;
        if (solution !== undefined) problem.solution = solution;
        if (isPremium !== undefined) problem.isPremium = Boolean(isPremium);
        if (isPublished !== undefined) problem.isPublished = Boolean(isPublished);
        if (timeLimit !== undefined) problem.timeLimit = timeLimit;
        if (memoryLimit !== undefined) problem.memoryLimit = memoryLimit;

        // Save Updates
        problem.updatedAt = new Date(); 
        await problem.save({ session }); 
        updatedProblem = problem;
        
    }); 

    session.endSession();

    // Redis Cache Cleanup 
    if (oldSlugToDelete) {
        await redisClient.del(`problem:${oldSlugToDelete}`);
        await redisClient.del(`eval_data:${oldSlugToDelete}`);
        await redisClient.del(`samples:${oldSlugToDelete}`);
    }
    await redisClient.del(`problem:${updatedProblem.slug}`);
    await redisClient.del(`eval_data:${updatedProblem.slug}`);
    await redisClient.del(`samples:${updatedProblem.slug}`);

    return res.status(200).json(new ApiResponse(200, updatedProblem, "Problem updated successfully"));
});

// --- DELETE PROBLEM (Admin/Master Only) ---
export const deleteProblem = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    // soft deletee
    // to achive o(1) complexity and save associated data deletion cost
    const problem = await Problem.findOneAndUpdate(
        { slug }, 
        { isDeleted: true }, 
        { new: true }
    );

    if (!problem) throw new ApiError(404, "Problem not found");

    if (!problem) throw new ApiError(404, "Problem not found");

    //  Clear all caches for the deleted problem
    await redisClient.del(`problem:${slug}`);
    await redisClient.del(`eval_data:${slug}`);
    await redisClient.del(`samples:${slug}`);

    return res.status(200).json(new ApiResponse(200, null, "Problem soft-deleted successfully"));

    return res.status(200).json(new ApiResponse(200, null, "Problem soft-deleted successfully"));
});

// ---  GET ALL TEST CASES FOR PROBLEM ---
export const getAllTestCasesForProblem = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    
    // FIX: Changed 'false' to '{ $ne: true }' 
    const problem = await Problem.findOne({ slug, isDeleted: { $ne: true } }).select("_id").lean();
    if (!problem) throw new ApiError(404, "Problem not found.");

    const testCases = await TestCase.find({ problem: problem._id })
        .select("input expectedOutput isSample createdAt")
        .sort({ createdAt: 1 }) 
        .lean(); 

    return res.status(200).json(new ApiResponse(200, testCases));
});

// --- ADD TEST CASE (Atomic Concurrency Guard) ---
export const addTestCaseToProblem = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { input, expectedOutput, isSample } = req.body;

    const problemInfo = await Problem.findOne({ slug, isDeleted: false }).select("_id maxTestCases").lean();
    if (!problemInfo) throw new ApiError(404, "Problem not found");

    const newTestCase = new TestCase({ problem: problemInfo._id, input, expectedOutput, isSample });
    await newTestCase.save();

    // Prevents race conditions where 2 requests pass the length check simultaneously
    const updatedProblem = await Problem.findOneAndUpdate(
        { 
            _id: problemInfo._id, 
            $expr: { $lt: [{ $size: "$testCases" }, "$maxTestCases"] } 
        },
        { $addToSet: { testCases: newTestCase._id } },
        { new: true }
    );

    if (!updatedProblem) {
        // If it failed, it means the array hit the limit mid-flight.
        // Clean up the orphaned testcase.
        await TestCase.findByIdAndDelete(newTestCase._id);
        throw new ApiError(400, `Cannot exceed maximum test cases limit.`);
    }

    //  Clear the evaluation caches so workers fetch the new testcase
    await redisClient.del(`eval_data:${slug}`);
    await redisClient.del(`samples:${slug}`);

    return res.status(201).json(new ApiResponse(201, newTestCase));
});

// ---  DELETE TEST CASE FROM PROBLEM (Admin/Master Only) ---
export const deleteTestCaseFromProblem = asyncHandler(async (req, res) => {
    const { testCaseId } = req.params;
    const session = await mongoose.startSession();

    let updatedProblem;

    await session.withTransaction(async () => {
        updatedProblem = await Problem.findOneAndUpdate(
            { testCases: testCaseId }, 
            { 
                $pull: { testCases: testCaseId },
                $set: { updatedAt: new Date() } 
            },
            { session, new: true }
        );

        if (!updatedProblem) throw new ApiError(404, "Test case not linked to any active problem");

        await TestCase.findByIdAndDelete(testCaseId).session(session);
        
    }, txnOptions); 
    
    session.endSession();

    // Now this works perfectly!
    if (updatedProblem && updatedProblem.slug) {
        await redisClient.del(`eval_data:${updatedProblem.slug}`);
        await redisClient.del(`samples:${updatedProblem.slug}`);
    }

    return res.status(200).json(new ApiResponse(200, null, "Test case deleted successfully."));
});

// ---  GET SOLUTION (Contest Secured & Parallel I/O) ---
export const getProblemSolution = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const userId = req.userId; 
    const isAdmin = req.userRole === "admin" || req.userRole === "master";

    const problem = await Problem.findOne({ slug, isDeleted: false })
        .select("_id solution isPublished")
        .lean();
        
    if (!problem) throw new ApiError(404, "Problem not found");

    // CONTEST SECURITY GUARD: 
    if (!problem.isPublished && !isAdmin) {
        throw new ApiError(
            403, 
            "Strict Contest Mode: Solutions are hidden until the arena closes and the problem is published."
        );
    }

    const cacheKey = `solution_unlock:${userId}:${problem._id}`;
    
    const [isUnlocked, acceptedSubmission] = await Promise.all([
        redisClient.get(cacheKey),
        Submission.findOne({ problem: problem._id, user: userId, status: "Accepted" }).lean() 
    ]);

    if (isUnlocked === "1" || acceptedSubmission || isAdmin) {
        if (!isUnlocked && acceptedSubmission) {
            redisClient.set(cacheKey, "1", { ex: 86400 * 30 }); 
        }
        return res.status(200).json(new ApiResponse(200, { solution: problem.solution }));
    }

    throw new ApiError(403, "You must successfully solve this problem to view the solution.");
});

// get unpublished problem during contest creation 
export const getUnpublishedProblems = asyncHandler(async (req, res) => {
    // Only fetch problems that are NOT published and NOT deleted
    const availableProblems = await Problem.find({ 
        isPublished: false, 
        isDeleted: { $ne: true } 
    })
    .select("_id title slug difficulty score")
    .lean();

    return res.status(200).json(
        new ApiResponse(200, availableProblems, "Available contest problems fetched.")
    );
});