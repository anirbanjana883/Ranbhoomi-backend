import { Worker } from "bullmq";
import { redisTCP, redisCache } from "../../../core/redis.js";
import { contestPollingQueue } from "../../../core/queue.js";
import ContestSubmission from "../contestSubmission.model.js";
import Problem from "../../problems/problem.model.js";
import TestCase from "../../problems/testCase.model.js";
import { getLanguageId } from "../../../shared/utils/constants.js";
import { formatSubmissions, submitToJudge0 } from "../judge.service.js";

export const initContestDispatchWorker = () => {
    const workerConnection = redisTCP.duplicate();
    
    const worker = new Worker("contest-dispatch-queue", async (job) => {
        const { submissionId, code, language, slug, userId, contestId } = job.data;

        const submission = await ContestSubmission.findById(submissionId).select("status").lean();
        if (!submission || submission.status !== "Queued") return;

        try {
            const languageId = getLanguageId(language);
            
            let evalDataStr = await redisCache.get(`eval_data:${slug}`);
            let evalData;
            
            if (!evalDataStr) {
                const prob = await Problem.findOne({ slug }).select("_id driverCode score timeLimit memoryLimit").lean();
                if (!prob) throw new Error("Problem not found");
                
                const testCases = await TestCase.find({ problem: prob._id }).lean();
                if (!testCases || testCases.length === 0) throw new Error("No test cases found");
                
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

            let finalCode = code;
            const driver = evalData.driverCode?.find(dc => dc.language.toLowerCase() === language.toLowerCase());
            if (driver) finalCode = `${code}\n\n${driver.code}`;

            const formatted = formatSubmissions(finalCode, languageId, evalData.testCases, evalData.timeLimit, evalData.memoryLimit);
            const tokens = await submitToJudge0(formatted);

            await ContestSubmission.findByIdAndUpdate(submissionId, {
                status: "Judging",
                judge0Tokens: tokens.map(t => ({ token: t }))
            });

            await contestPollingQueue.add("poll-contest-judge", {
                submissionId, tokens, slug, userId, contestId, code, language, attempt: 1
            }, { delay: 2000 });

        } catch (error) {
            console.error(`[Contest Dispatch Error] Job ${submissionId}:`, error.message);
            await ContestSubmission.findByIdAndUpdate(submissionId, { status: "Internal Error" });
            
            await redisTCP.publish("submission-events", JSON.stringify({
                userId, submissionId, status: "Internal Error"
            }));

            const multiResponse = await redisTCP.multi()
                .incr("judge0_fail_count")
                .expire("judge0_fail_count", 60, 'NX')
                .exec();
            
            const failCount = multiResponse?.[0]?.[1] || 0;
            if (failCount > 20) {
                console.warn("CIRCUIT BREAKER TRIPPED! Judge0 is failing.");
                await redisCache.set("circuit_breaker:judge0", "1", { ex: 30 }); 
            }

            throw error; 
        }
    }, { 
        connection: workerConnection,
        concurrency: 15,
        stalledInterval: 60000, 
        lockDuration: 60000,    
        metrics: null            
    }); 

    console.log(" => Contest Dispatch Worker Initialized");
    return worker;
};