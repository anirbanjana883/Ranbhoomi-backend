import { Worker } from "bullmq";
import connection, { pollingQueue } from "../config/queue.js";
import Submission from "../models/submissionModel.js";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import redisClient from "../config/redis.js";
import { getLanguageId } from "../config/languageIds.js";
import { formatSubmissions, submitToJudge0 } from "../services/judgeService.js";

export const initDispatchWorker = () => {

    const workerConnection = connection.duplicate();

    const worker = new Worker("dispatch-queue", async (job) => {
        const { submissionId, code, language, slug, userId } = job.data;

        // Idempotency Guard: Ensure we don't re-dispatch if retried
        const submission = await Submission.findById(submissionId).select("status").lean();
        if (!submission || submission.status !== "Queued") return;

        try {
            const languageId = getLanguageId(language);
            
            let evalDataStr = await redisClient.get(`eval_data:${slug}`);
            let evalData;
            
            if (!evalDataStr) {
                // 🚀 FIX: Fetch timeLimit and memoryLimit from DB
                const prob = await Problem.findOne({ slug }).select("_id driverCode score timeLimit memoryLimit").lean();
                if (!prob) throw new Error("Problem not found");
                
                const testCases = await TestCase.find({ problem: prob._id }).lean();
                if (!testCases || testCases.length === 0) throw new Error("No test cases found");
                
                // 🚀 FIX: Cache the limits in Redis
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

            // Merge Code
            let finalCode = code;
            const driver = evalData.driverCode?.find(dc => dc.language.toLowerCase() === language.toLowerCase());
            if (driver) finalCode = `${code}\n\n${driver.code}`;

            // Submit to Judge0
            // 🚀 FIX: Pass the cached limits to formatSubmissions
            const formatted = formatSubmissions(
                finalCode, 
                languageId, 
                evalData.testCases, 
                evalData.timeLimit, 
                evalData.memoryLimit
            );
            const tokens = await submitToJudge0(formatted);

            // Update DB
            await Submission.findByIdAndUpdate(submissionId, {
                status: "Judging",
                judge0Tokens: tokens.map(t => ({ token: t }))
            });

            // Non-Blocking Handoff to Polling Queue (Wait 2 seconds before first poll)
            await pollingQueue.add("poll-judge", {
                submissionId, tokens, slug, userId, attempt: 1
            }, { delay: 2000 });

        } catch (error) {
            console.error(`[Dispatch Error] Job ${submissionId}:`, error.message);
            
            // FIX: Hard Failure Handling
            await Submission.findByIdAndUpdate(submissionId, { status: "Internal Error" });
            
            await connection.publish("submission-events", JSON.stringify({
                userId, submissionId, status: "Internal Error"
            }));

            // FIX: Circuit Breaker Tripping
            const multiResponse = await redisClient.multi()
                .incr("judge0_fail_count")
                .expire("judge0_fail_count", 60, 'NX')
                .exec();
            
            const failCount = multiResponse?.[0]?.[1] || 0;
            if (failCount > 20) {
                console.warn("CIRCUIT BREAKER TRIPPED! Judge0 is failing.");
                await redisClient.set("circuit_breaker:judge0", "1", "EX", 30); 
            }

            throw error; 
        }
    }, { 
        // BULLMQ WORKER SETTINGS
        connection : workerConnection, 
        concurrency: 10,

        //  UPSTASH FREE TIER SURVIVAL SETTINGS 
        stalledInterval: 60000, // Check for crashed jobs every 60s instead of 30s
        lockDuration: 60000,    // Keep job lock for 60s
        metrics: null           // Disable heavy metric tracking polling
    });

    console.log(" => Dispatch Worker Initialized");
    return worker;
};