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

// format for judge0
const formatSubmissions = (code, languageId, testCases) => {
    return testCases.map(tc => ({
        source_code: Buffer.from(code).toString('base64'),
        language_id: languageId,
        stdin: Buffer.from(tc.input).toString('base64'),
        expected_output: Buffer.from(tc.expectedOutput).toString('base64'),
    }));
};

export const initWorker = () => {
  const worker = new Worker(
    "submission-queue",
    async (job) => {
        // Job Data: { submissionId, code, language, slug }
        const { submissionId, code, language, slug } = job.data;
        console.log(`👷 Worker processing submission: ${submissionId}`);

        try {
            //  Get Language ID
            const languageId = getLanguageId(language);
            if (!languageId) throw new Error("Invalid Language");

            //  Fetch Problem & Test Cases
            const problem = await Problem.findOne({ slug }).select("driverCode");
            const testCases = await TestCase.find({ problem: problem._id });
            
            if (!testCases || testCases.length === 0) {
                throw new Error("No test cases found");
            }

            //  Merge Driver Code
            let finalSourceCode = code;
            if (problem.driverCode && problem.driverCode.length > 0) {
                const driver = problem.driverCode.find(
                    (dc) => dc.language.toLowerCase() === language.toLowerCase()
                );
                if (driver) finalSourceCode = `${code}\n\n${driver.code}`;
            }

            // Call Judge0 API
            const submissions = formatSubmissions(finalSourceCode, languageId, testCases);
            
            const judge0Response = await axios.post(
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

            //  Update Database with Tokens
            const submissionTokens = judge0Response.data.map(s => ({ token: s.token }));
            
            await Submission.findByIdAndUpdate(submissionId, {
                status: "Judging", 
                judge0Tokens: submissionTokens,
                testCases: testCases.map(tc => tc._id)
            });

            console.log(` Job ${submissionId} sent to Judge0!`);
            return { success: true };

        } catch (error) {
            console.error(` Job ${submissionId} Failed:`, error.message);
            await Submission.findByIdAndUpdate(submissionId, {
                status: "Runtime Error",
                results: []
            });
            throw error;
        }
    },
    { connection: redisConnection }
  );

  console.log(" Worker is running and listening for jobs...");
};