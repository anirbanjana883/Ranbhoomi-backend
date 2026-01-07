import { Queue, Worker } from "bullmq";
import dotenv from "dotenv";
import axios from "axios";
import Submission from "../models/submissionModel.js";
import ContestSubmission from "../models/contestSubmissionModel.js"; 
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import { getLanguageId } from "../config/languageIds.js";
import { updateLeaderboard } from "../services/rankingService.js";
import { submissionQueueGauge } from "./monitoring.js"; 

dotenv.config();

const redisConnection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : { host: "localhost", port: 6379 };

export const submissionQueue = new Queue("submission-queue", {
  connection: redisConnection,
});

// Format for Judge0
const formatSubmissions = (code, languageId, testCases) => {
    return testCases.map(tc => ({
        source_code: Buffer.from(code).toString('base64'),
        language_id: languageId,
        stdin: Buffer.from(tc.input).toString('base64'),
        expected_output: Buffer.from(tc.expectedOutput).toString('base64'),
    }));
};

// Poll Judge0 logic
const pollJudge0Results = async (tokens) => {
    const tokenString = tokens.join(",");
    let results = [];
    let isProcessing = true;
    let attempts = 0;

    while (isProcessing && attempts < 10) { 
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            const response = await axios.get(
                `https://${process.env.JUDGE0_API_HOST}/submissions/batch`,
                {
                    params: {
                        tokens: tokenString,
                        base64_encoded: "true",
                        fields: "token,status,stdout,time,memory"
                    },
                    headers: {
                        'x-rapidapi-key': process.env.JUDGE0_API_KEY,
                        'x-rapidapi-host': process.env.JUDGE0_API_HOST
                    }
                }
            );
            const data = response.data.submissions;
            const pending = data.filter(s => s.status.id <= 2);
            if (pending.length === 0) {
                results = data;
                isProcessing = false;
            }
        } catch (error) {
            console.error("Polling Error:", error.message);
        }
    }
    return results;
};

// MAIN WORKER
export const initWorker = (io) => {
  
  // MONITORING: Update Queue Depth Metric every 5s
  setInterval(async () => {
     const waiting = await submissionQueue.getWaitingCount();
     const active = await submissionQueue.getActiveCount();
     submissionQueueGauge.set(waiting + active);
  }, 5000);

  const worker = new Worker(
    "submission-queue",
    async (job) => {
        // Extract Contest Data
        const { submissionId, code, language, slug, userId, isContest, contestId, userName } = job.data;
        const SubmissionModel = isContest ? ContestSubmission : Submission;

        console.log(`Processing ${isContest ? "Contest" : "Practice"} Submission: ${submissionId}`);

        try {
            const languageId = getLanguageId(language);
            if (!languageId) throw new Error("Invalid Language");

            const problem = await Problem.findOne({ slug }).select("driverCode score");
            const testCases = await TestCase.find({ problem: problem._id });
            
            if (!testCases || testCases.length === 0) throw new Error("No test cases found");

            // Merge Driver Code
            let finalSourceCode = code;
            if (problem.driverCode?.length > 0) {
                const driver = problem.driverCode.find(
                    (dc) => dc.language.toLowerCase() === language.toLowerCase()
                );
                if (driver) finalSourceCode = `${code}\n\n${driver.code}`;
            }

            // Send to Judge0
            const submissions = formatSubmissions(finalSourceCode, languageId, testCases);
            const batchResponse = await axios.post(
                `https://${process.env.JUDGE0_API_HOST}/submissions/batch?base64_encoded=true`,
                { submissions },
                {
                    headers: {
                        'x-rapidapi-key': process.env.JUDGE0_API_KEY,
                        'x-rapidapi-host': process.env.JUDGE0_API_HOST,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const tokens = batchResponse.data.map(s => s.token);
            const results = await pollJudge0Results(tokens);

            // Calculate Status
            const isAllAccepted = results.length > 0 && results.every(r => r.status.id === 3);
            const finalStatus = isAllAccepted ? "Accepted" : "Wrong Answer"; 
            
            // Score Logic (Use Problem Score for contests)
            const score = isAllAccepted ? (isContest ? (problem.score || 10) : 100) : 0;

            const detailedResults = results.map((r, index) => ({
                testCase: testCases[index]?._id,
                status: r.status.id === 3 ? "Passed" : "Failed",
                output: r.stdout ? Buffer.from(r.stdout, 'base64').toString() : ""
            }));
            
            // Update Database
            await SubmissionModel.findByIdAndUpdate(submissionId, {
                status: finalStatus,
                judge0Tokens: tokens.map(t => ({ token: t })),
                score: score,
                results: detailedResults
            });

            console.log(`Job ${submissionId} Finished: ${finalStatus}`);

            // LEADERBOARD UPDATE
            if (isContest && finalStatus === "Accepted" && contestId) {
                await updateLeaderboard(contestId, userId, userName || "User", score);
            }
            
            // Return for Socket
            return { 
                status: finalStatus, 
                userId, 
                submissionId,
                score,
                results: detailedResults,
                isContest
            };

        } catch (error) {
            console.error(`Job ${submissionId} Failed:`, error.message);
            await SubmissionModel.findByIdAndUpdate(submissionId, { status: "Runtime Error" });
            throw error;
        }
    },
    { connection: redisConnection }
  );

  // SOCKET EMITTER
  worker.on("completed", (job, returnValue) => {
    if (io && returnValue?.userId) {
        io.to(returnValue.userId).emit("submission-result", {
            submissionId: returnValue.submissionId,
            status: returnValue.status,
            score: returnValue.score,
            results: returnValue.results,
            isContest: returnValue.isContest
        });
    }
  });

  console.log("Worker is running with Monitoring & Contest Support...");
};