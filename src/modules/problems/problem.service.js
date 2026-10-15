import problemRepository from "./problem.repository.js";
import { generateProblemCodes } from "./utils/codeGenerator.js";
import { ALLOWED_PROBLEM_TAGS, normalizeProblemTag, ALLOWED_COMPANY_TAGS, normalizeCompanyTag } from "../../shared/utils/constants.js";
import { redisCache } from "../../core/redis.js";
import mongoose from "mongoose";
import { ApiError } from "../../shared/utils/ApiError.js";

class ProblemService {
    async getPublicProblems(query) {
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter = { isPublished: true, isDeleted: { $ne: true } };
        if (query.difficulty) filter.difficulty = query.difficulty;
        if (query.tags) filter.tags = { $all: query.tags.split(",").map(t => t.trim().toLowerCase()) };
        if (query.company) filter.companyTags = query.company.trim().toLowerCase();
        if (query.search) filter.$text = {$search: query.search };
        return problemRepository.findProblems(filter, skip, limit, { isPublished: 1, createdAt: -1 }, "title slug difficulty tags companyTags createdAt isPremium executionStats");
    }

    async getAdminProblems(query) {
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 50;
        const skip = (page - 1) * limit;
        const filter = { isDeleted: { $ne: true } };
        if (query.difficulty) filter.difficulty = query.difficulty;
        if (query.tags) filter.tags = { $all: query.tags.split(",").map(t => t.trim().toLowerCase()) };
        if (query.company) filter.companyTags = query.company.trim().toLowerCase();
        if (query.search) filter.$text = {$search: query.search };
        return problemRepository.findProblems(filter, skip, limit, { isDeleted: 1, createdAt: -1 }, "title slug difficulty tags companyTags createdAt isPremium isPublished executionStats");
    }

    async getProblemBySlug(slug) {
        const cacheKey = `problem:${slug}`;
        let cached = await redisCache.get(cacheKey);
        if (cached) return typeof cached === "string" ? JSON.parse(cached) : cached;

        const lockKey = `lock:problem:${slug}`;
        const gotLock = await redisCache.set(lockKey, "1", { nx: true, ex: 5 });

        if (!gotLock) {
            for (let i = 0; i < 4; i++) {
                await new Promise(res => setTimeout(res, 50));
                cached = await redisCache.get(cacheKey);
                if (cached) return typeof cached === "string" ? JSON.parse(cached) : cached;
            }
        }

        const problem = await problemRepository.findBySlug(slug, true);
        if (!problem) throw new ApiError(404, "Problem not found");

        if (gotLock) {
            await redisCache.set(cacheKey, JSON.stringify(problem), { ex: 600 });
            await redisCache.del(lockKey);
        }
        return problem;
    }

    async createProblem(data) {
        const session = await mongoose.startSession();
        let created;
        await session.withTransaction(async () => {
            if (!data.signature || !data.signature.functionName || !data.signature.returnType || !Array.isArray(data.signature.parameters)) {
                throw new ApiError(400, "Problem signature required");
            }
            if (!data.title || !data.description || !data.difficulty || !data.testCasesData || !data.testCasesData.length) {
                throw new ApiError(400, "Missing required fields");
            }

            const { starterCode, driverCode } = generateProblemCodes(data.signature);
            const generatedSlug = data.title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");

            if (await problemRepository.findOne({ $or: [{ title: data.title }, { slug: generatedSlug }] }, session)) {
                throw new ApiError(400, "Problem already exists");
            }

            const problem = await problemRepository.createProblem({
                ...data, slug: generatedSlug, starterCode, driverCode, testCases: []
            }, session);

            if (data.testCasesData && data.testCasesData.length > 0) {
                const tcData = data.testCasesData.map(tc => ({ problem: problem._id, input: tc.input, expectedOutput: tc.expectedOutput, isSample: tc.isSample }));
                const tcs = await problemRepository.createTestCases(tcData, session);
                problem.testCases = tcs.map(t => t._id);
                await problem.save({ session });
            }
            created = problem;
        });
        session.endSession();
        return created;
    }

    async updateProblem(slug, data) {
        const session = await mongoose.startSession();
        let updated, oldSlug = null;
        await session.withTransaction(async () => {
            const problem = await problemRepository.findOne({ slug, isDeleted: { $ne: true } }, session);
            if (!problem) throw new ApiError(404, "Problem not found");

            if (data.title && data.title !== problem.title) {
                const newSlug = data.title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
                if (await problemRepository.findOne({ slug: newSlug, _id: { $ne: problem._id } }, session)) {
                    throw new ApiError(400, "Slug in use");
                }
                oldSlug = problem.slug;
                problem.title = data.title;
                problem.slug = newSlug;
            }

            if (data.signature && data.signature.functionName) {
                const { starterCode, driverCode } = generateProblemCodes(data.signature);
                problem.signature = data.signature;
                problem.starterCode = starterCode;
                problem.driverCode = driverCode;
            }

            if (data.tags) problem.tags = data.tags.map(normalizeProblemTag).filter(Boolean);
            if (data.companyTags) problem.companyTags = data.companyTags.map(normalizeCompanyTag).filter(Boolean);

            ["description", "difficulty", "solution", "isPremium", "isPublished", "timeLimit", "memoryLimit"].forEach(key => {
                if (data[key] !== undefined) problem[key] = data[key];
            });

            problem.updatedAt = new Date();
            await problem.save({ session });
            updated = problem;
        });
        session.endSession();

        if (oldSlug) await redisCache.del(`problem:${oldSlug}`, `eval_data:${oldSlug}`, `samples:${oldSlug}`);
        await redisCache.del(`problem:${updated.slug}`, `eval_data:${updated.slug}`, `samples:${updated.slug}`);
        return updated;
    }

    async deleteProblem(slug) {
        const problem = await problemRepository.softDelete(slug);
        if (!problem) throw new ApiError(404, "Problem not found");
        await redisCache.del(`problem:${slug}`, `eval_data:${slug}`, `samples:${slug}`);
    }

    async addTestCase(slug, data) {
        const problem = await problemRepository.findOne({ slug, isDeleted: false });
        if (!problem) throw new ApiError(404, "Problem not found");
        const tc = await problemRepository.createSingleTestCase({ problem: problem._id, ...data });
        const updated = await problemRepository.addTestCaseToProblemUnsafe(problem._id, tc._id, problem.maxTestCases);
        if (!updated) {
            await problemRepository.deleteTestCaseDirect(tc._id);
            throw new ApiError(400, "Max test cases reached");
        }
        await redisCache.del(`eval_data:${slug}`, `samples:${slug}`);
        return tc;
    }

    async deleteTestCase(id) {
        const session = await mongoose.startSession();
        let prob;
        await session.withTransaction(async () => {
            prob = await problemRepository.pullTestCaseFromProblem(id, session);
            if (!prob) throw new ApiError(404, "TestCase not found");
            await problemRepository.deleteTestCaseDirect(id, session);
        });
        session.endSession();
        if (prob) await redisCache.del(`eval_data:${prob.slug}`, `samples:${prob.slug}`);
    }
    
    async getSolution(slug, userId, isAdmin) {
        const problem = await problemRepository.findBySlug(slug);
        if (!problem) throw new ApiError(404, "Problem not found");
        if (!problem.isPublished && !isAdmin) throw new ApiError(403, "Strict Contest Mode: Solutions hidden.");
        
        const cacheKey = `solution_unlock:${userId}:${problem._id}`;
        const isUnlocked = await redisCache.get(cacheKey);
        
        // Relies on execution module model logic implicitly or can be injected
        const { default: Submission } = await import("../codeexecution/submission.model.js");
        const accepted = await Submission.findOne({ problem: problem._id, user: userId, status: "Accepted" }).lean();
        
        if (isUnlocked === "1" || accepted || isAdmin) {
            if (!isUnlocked && accepted) await redisCache.set(cacheKey, "1", { ex: 86400 * 30 });
            return problem.solution;
        }
        throw new ApiError(403, "You must solve this problem to view the solution.");
    }
}

export default new ProblemService();