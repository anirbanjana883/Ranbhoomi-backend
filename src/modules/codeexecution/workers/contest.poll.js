import { Worker } from "bullmq";
import crypto from "crypto";
import { redisTCP, redisCache } from "../../../core/redis.js";
import { contestPollingQueue } from "../../../core/queue.js";
import ContestSubmission from "../contestSubmission.model.js";
import Problem from "../../problems/problem.model.js";
import TestCase from "../../problems/testCase.model.js";
import { pollJudge0Batch } from "../judge.service.js";
import rankingService from "../../contests/ranking.service.js"; 

const safeTruncate = (str) => {
    if (!str) return "";
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    return decoded.length > 5000 ? decoded.substring(0, 5000) + "\n...[TRUNCATED]" : decoded;
};

export const initContestPollingWorker = () => {
    const workerConnection = redisTCP.duplicate();

    const worker = new Worker("contest-polling-queue", async (job) => {
        const { submissionId, tokens, slug, userId, contestId, code, language, attempt } = job.data;

        const submission = await ContestSubmission.findById(submissionId).select("status createdAt").lean();
        if (!submission || submission.status !== "Judging") return; 

        if (attempt > 15) {
            await ContestSubmission.findByIdAndUpdate(submissionId, { status: "Internal Error" });
            await redisTCP.publish("submission-events", JSON.stringify({ userId, submissionId, status: "Internal Error" }));
            return; 
        }

        try {
            const results = await pollJudge0Batch(tokens);
            const isPending = results.some(r => r.status.id <= 2);

            if (isPending) {
                await contestPollingQueue.add("poll-contest-judge", { ...job.data, attempt: attempt + 1 }, { delay: 2000 });
                return;
            }

            let evalDataStr = await redisCache.get(`eval_data:${slug}`);
            let evalData;
            
            if (!evalDataStr) {
                const prob = await Problem.findOne({ slug }).select("_id driverCode score timeLimit memoryLimit").lean();
                const testCases = await TestCase.find({ problem: prob._id }).lean();
                
                evalData = { 
                    driverCode: prob.driverCode, 
                    score: prob.score, 
                    testCases,
                    timeLimit: prob.timeLimit,
                    memoryLimit: prob.memoryLimit
                };
                await redisCache.set(`eval_data:${slug}`, JSON.stringify(evalData), { ex: 3600 });
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

            await ContestSubmission.findByIdAndUpdate(submissionId, {
                status: finalStatus, 
                results: detailedResults,
                score, 
                executionTime: maxTime, 
                memoryUsed: maxMemory
            });

            const hashPayload = `${code}-${language}`;
            const codeHash = crypto.createHash("sha256").update(hashPayload).digest("hex");
            const cacheKey = `cache:sub:${evalData.testCases[0]?.problem}:${codeHash}`;
            
            await redisCache.set(cacheKey, JSON.stringify({
                status: finalStatus, score, executionTime: maxTime, memoryUsed: maxMemory, results: detailedResults
            }), { ex: 86400 });

            try {
                await rankingService.updateLiveLeaderboard(contestId, userId, slug, finalStatus, score, submission.createdAt);
            } catch (leaderboardError) {
                console.error("Failed to update live leaderboard:", leaderboardError);
            }

            await redisTCP.publish("submission-events", JSON.stringify({ userId, submissionId, status: finalStatus }));

        } catch (error) {
            console.error(`[Contest Polling Error] Job ${submissionId}:`, error.message);
            await ContestSubmission.findByIdAndUpdate(submissionId, { status: "Internal Error" });
            await redisTCP.publish("submission-events", JSON.stringify({ userId, submissionId, status: "Internal Error" }));
            throw error;
        }
    }, { 
        connection : workerConnection, 
        concurrency: 30,
        stalledInterval: 60000, 
        lockDuration: 60000,    
        metrics: null            
    }); 

    console.log(" => Contest Polling Worker Initialized");
    return worker;
};