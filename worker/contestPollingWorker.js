import { Worker } from "bullmq";
import crypto from "crypto";
import connection, { contestPollingQueue, leaderboardQueue } from "../config/queue.js";
import ContestSubmission from "../models/contestSubmissionModel.js";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import redisClient from "../config/redis.js";
import { pollJudge0Batch } from "../services/judgeService.js";
import { updateLeaderboard } from "../services/rankingService.js";

const safeTruncate = (str) => {
    if (!str) return "";
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    return decoded.length > 5000 ? decoded.substring(0, 5000) + "\n...[TRUNCATED]" : decoded;
};

export const initContestPollingWorker = () => {
    new Worker("contest-polling-queue", async (job) => {
        const { submissionId, tokens, slug, userId, contestId, code, language, attempt } = job.data;

        // Idempotency Guard
        const submission = await ContestSubmission.findById(submissionId).select("status createdAt").lean();
        if (!submission || submission.status !== "Judging") return; 

        // Timeout Guard (Dead Letter)
        if (attempt > 15) {
            await ContestSubmission.findByIdAndUpdate(submissionId, { status: "Internal Error" });
            await connection.publish("submission-events", JSON.stringify({ userId, submissionId, status: "Internal Error" }));
            return; 
        }

        try {
            const results = await pollJudge0Batch(tokens);
            const isPending = results.some(r => r.status.id <= 2);

            if (isPending) {
                await contestPollingQueue.add("poll-contest-judge", {
                    ...job.data, attempt: attempt + 1
                }, { delay: 2000 });
                return;
            }

            // --- PROCESSING FINISHED --- 
            let evalDataStr = await redisClient.get(`eval_data:${slug}`);
            let evalData;
            
            if (!evalDataStr) {
                const prob = await Problem.findOne({ slug }).select("_id driverCode score").lean();
                const testCases = await TestCase.find({ problem: prob._id }).lean();
                evalData = { driverCode: prob.driverCode, score: prob.score, testCases };
                await redisClient.set(`eval_data:${slug}`, JSON.stringify(evalData), { ex: 3600 });
            } else {
                evalData = typeof evalDataStr === "string" ? JSON.parse(evalDataStr) : evalDataStr;
            }

            let isAllAccepted = true;
            let finalStatus = "Accepted";
            let maxTime = 0, maxMemory = 0;

            const detailedResults = results.map((r, i) => {
                if (r.status.id !== 3) {
                    isAllAccepted = false;
                    if (r.status.id === 6) finalStatus = "Compilation Error";
                    else if (r.status.id === 5) finalStatus = "Time Limit Exceeded";
                    else if ([7,8,9,10,11].includes(r.status.id)) finalStatus = "Runtime Error";
                    else if (r.status.id === 12) finalStatus = "Memory Limit Exceeded";
                    else if (finalStatus === "Accepted") finalStatus = "Wrong Answer";
                }
                
                const timeFloat = parseFloat(r.time || 0);
                const memInt = parseInt(r.memory || 0);
                maxTime = Math.max(maxTime, timeFloat);
                maxMemory = Math.max(maxMemory, memInt);

                return {
                    testCase: evalData.testCases[i]?._id,
                    status: r.status.id === 3 ? "Passed" : "Failed",
                    time: timeFloat,
                    memory: memInt,
                    output: safeTruncate(r.compile_output || r.stderr || r.stdout)
                };
            });

            const score = isAllAccepted ? (evalData.score || 100) : 0;

            // 1. Atomic DB Update
            await ContestSubmission.findByIdAndUpdate(submissionId, {
                status: finalStatus, 
                results: detailedResults,
                score, 
                executionTime: maxTime, 
                memoryUsed: maxMemory
            });

            // 🧠 2. CACHE THE RESULT (Phase 2 - Code Hashing)
            const hashPayload = `${code}-${language}`;
            const codeHash = crypto.createHash("sha256").update(hashPayload).digest("hex");
            const cacheKey = `cache:sub:${evalData.testCases[0]?.problem}:${codeHash}`;
            
            await redisClient.set(cacheKey, JSON.stringify({
                status: finalStatus, score, executionTime: maxTime, memoryUsed: maxMemory, results: detailedResults
            }), { EX: 86400 });

            // 🏆 3. UPDATE CONTEST LEADERBOARD (Triggers leaderboard worker)
            // await leaderboardQueue.add("update-contest-rank", { 
            //     contestId, 
            //     userId, 
            //     problemSlug: slug, 
            //     status: finalStatus, 
            //     score,
            //     submissionTime: submission.createdAt // Used for time penalties
            // });

            // 🏆 3. UPDATE CONTEST LEADERBOARD (Direct Function Call)
            try {
                await updateLeaderboard(
                    contestId, 
                    userId, 
                    slug, 
                    finalStatus, 
                    score, 
                    submission.createdAt
                );
            } catch (leaderboardError) {
                console.error("⚠️ Failed to update live leaderboard:", leaderboardError);
            }

            // 📡 4. NOTIFY USER SOCKET
            await connection.publish("submission-events", JSON.stringify({
                userId, submissionId, status: finalStatus
            }));

        } catch (error) {
            console.error(`[Contest Polling Error] Job ${submissionId}:`, error.message);
            await ContestSubmission.findByIdAndUpdate(submissionId, { status: "Internal Error" });
            await connection.publish("submission-events", JSON.stringify({
                userId, submissionId, status: "Internal Error"
            }));
            throw error;
        }
    }, { connection, concurrency: 30 }); // 🔥 Massive polling capacity

    console.log("🕵️ Contest Polling Worker Initialized");
};