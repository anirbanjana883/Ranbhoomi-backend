import { Queue, Worker } from "bullmq";
import dotenv from "dotenv";
import axios from "axios";
import Submission from "../models/submissionModel.js";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import { getLanguageId } from "../config/languageIds.js";

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

//  Poll Judge0 until results are ready
const pollJudge0Results = async (tokens) => {
    const tokenString = tokens.join(",");
    let results = [];
    let isProcessing = true;
    let attempts = 0;

    while (isProcessing && attempts < 10) { 
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));

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
    }
    return results;
};

//  MAIN WORKER
export const initWorker = (io) => {
  const worker = new Worker(
    "submission-queue",
    async (job) => {
        const { submissionId, code, language, slug, userId } = job.data;
        console.log(` Worker processing submission: ${submissionId}`);

        try {
            const languageId = getLanguageId(language);
            if (!languageId) throw new Error("Invalid Language");

            const problem = await Problem.findOne({ slug }).select("driverCode");
            const testCases = await TestCase.find({ problem: problem._id });
            
            if (!testCases || testCases.length === 0) throw new Error("No test cases found");

            // Merging driver code
            let finalSourceCode = code;
            if (problem.driverCode?.length > 0) {
                const driver = problem.driverCode.find(
                    (dc) => dc.language.toLowerCase() === language.toLowerCase()
                );
                if (driver) finalSourceCode = `${code}\n\n${driver.code}`;
            }

            // sending to judge0
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

            //  Poll for Results 
            const results = await pollJudge0Results(tokens);

            // Calculate Final Status 
            const isAllAccepted = results.every(r => r.status.id === 3);
            const finalStatus = isAllAccepted ? "Accepted" : "Wrong Answer"; 
            
            // databse updation with final result
            await Submission.findByIdAndUpdate(submissionId, {
                status: finalStatus,
                judge0Tokens: tokens.map(t => ({ token: t })),
            });

            console.log(` Job ${submissionId} Finished: ${finalStatus}`);
            
            // Return data for the Socket Emitter
            return { 
                status: finalStatus, 
                userId, 
                submissionId,
                score: isAllAccepted ? 100 : 0 
            };

        } catch (error) {
            console.error(` Job ${submissionId} Failed:`, error.message);
            await Submission.findByIdAndUpdate(submissionId, { status: "Runtime Error" });
            throw error;
        }
    },
    { connection: redisConnection }
  );

  //  SOCKET EVENT TRIGGER
  worker.on("completed", (job, returnValue) => {
    if (io && returnValue?.userId) {
        console.log(` Emitting result to User ${returnValue.userId}`);
        
        io.to(returnValue.userId).emit("submission-result", {
            submissionId: returnValue.submissionId,
            status: returnValue.status,
            score: returnValue.score
        });
    }
  });

  console.log(" Worker is running and listening for jobs...");
};