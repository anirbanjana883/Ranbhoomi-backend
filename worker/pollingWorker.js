import { Worker } from "bullmq";
import connection, { pollingQueue } from "../config/queue.js";
import Submission from "../models/submissionModel.js";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import redisClient from "../config/redis.js";
import { pollJudge0Batch } from "../services/judgeService.js";

// Helper for truncation
const safeTruncate = (str) => {
    if (!str) return "";
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    return decoded.length > 5000 ? decoded.substring(0, 5000) + "\n...[TRUNCATED]" : decoded;
};

export const initPollingWorker = () => {
    new Worker("polling-queue", async (job) => {
        const { submissionId, tokens, slug, userId, attempt } = job.data;

        // FIX: Strict Idempotency Guard
        const submission = await Submission.findById(submissionId).select("status").lean();
        if (!submission || submission.status !== "Judging") return; 

        // Timeout Guard (Dead Letter)
        if (attempt > 15) {
            await Submission.findByIdAndUpdate(submissionId, { status: "Internal Error" });
            console.error(`[DLQ] Submission ${submissionId} timed out after 15 polls.`);
            
            await connection.publish("submission-events", JSON.stringify({
                userId, submissionId, status: "Internal Error"
            }));
            return; 
        }

        try {
            // Poll Judge0 ONCE
            const results = await pollJudge0Batch(tokens);
            const isPending = results.some(r => r.status.id <= 2);

            if (isPending) {
                // Non-Blocking Re-queue: Free up the worker thread.
                await pollingQueue.add("poll-judge", {
                    ...job.data, attempt: attempt + 1
                }, { delay: 2000 });
                return;
            }

            // --- PROCESSING FINISHED --- 

            // FIX: Cache Healing (Fallback to DB if Redis evicted the key mid-flight)
            let evalDataStr = await redisClient.get(`eval_data:${slug}`);
            let evalData;
            
            if (!evalDataStr) {
                console.warn(`Cache miss for eval_data:${slug} during polling. Healing cache...`);
                const prob = await Problem.findOne({ slug }).select("_id driverCode score timeLimit memoryLimit").lean();
                if (!prob) throw new Error("Problem not found during evaluation");
                const testCases = await TestCase.find({ problem: prob._id }).lean();
                
                evalData = { 
                    driverCode: prob.driverCode, 
                    score: prob.score, 
                    testCases,
                    timeLimit: prob.timeLimit,
                    memoryLimit: prob.memoryLimit
                };
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

            // Atomic DB Update
            await Submission.findByIdAndUpdate(submissionId, {
                status: finalStatus, 
                results: detailedResults,
                score, 
                executionTime: maxTime, 
                memoryUsed: maxMemory
            });

            // Notify Socket Gateway
            await connection.publish("submission-events", JSON.stringify({
                userId, submissionId, status: finalStatus
            }));

        } catch (error) {
            console.error(`[Polling Error] Job ${submissionId}:`, error.message);
            await Submission.findByIdAndUpdate(submissionId, { status: "Internal Error" });
            
            await connection.publish("submission-events", JSON.stringify({
                userId, submissionId, status: "Internal Error"
            }));
            
            throw error;
        }
    }, { connection, concurrency: 20 }); 

    console.log("Polling Worker Initialized");
};