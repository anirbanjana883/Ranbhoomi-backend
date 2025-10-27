import Submission from "../models/submissionModel.js";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import { getLanguageId } from "../config/languageIds.js";
import axios from "axios";

// Helper to format data for Judge0 Batch Submission
const formatSubmissions = (code, languageId, testCases) => {
    return testCases.map(tc => ({
        source_code: Buffer.from(code).toString('base64'),
        language_id: languageId,
        stdin: Buffer.from(tc.input).toString('base64'),
        expected_output: Buffer.from(tc.expectedOutput).toString('base64'),
        // Add CPU/memory limits if needed
        // cpu_time_limit: 2, // 2 seconds
        // memory_limit: 128000 // 128 MB
    }));
};

// --- CREATE SUBMISSION  ---
export const createSubmission = async (req, res) => {
    const { slug, language, code } = req.body;
    const userId = req.userId;

    if (!language || !code || !slug) {
        return res.status(400).json({ message: "Problem, language, and code are required." });
    }

    try {
        // 1. Get Language ID
        const languageId = getLanguageId(language);
        if (!languageId) {
            return res.status(400).json({ message: `Language '${language}' is not supported.` });
        }

        // 2. Find Problem and ALL its Test Cases (hidden + sample)
        const problem = await Problem.findOne({ slug: slug }).select("_id");
        if (!problem) {
            return res.status(404).json({ message: "Problem not found." });
        }
        const testCases = await TestCase.find({ problem: problem._id });
        if (!testCases || testCases.length === 0) {
            return res.status(400).json({ message: "Problem has no test cases." });
        }

        // 3. Format data for Judge0 (Batch Submission)
        const submissions = formatSubmissions(code, languageId, testCases);
        const judge0Payload = { submissions };

        // 4. Post to Judge0
        const judge0Response = await axios.post(
            `https://${process.env.JUDGE0_API_HOST}/submissions/batch?base64_encoded=true`,
            judge0Payload,
            {
                headers: {
                    'x-rapidapi-key': process.env.JUDGE0_API_KEY,
                    'x-rapidapi-host': process.env.JUDGE0_API_HOST,
                    'Content-Type': 'application/json'
                }
            }
        );

        // 5. Create "Pending" Submission in our DB
        // We get an array of {token} objects back from Judge0
        const submissionTokens = judge0Response.data.map(s => ({ token: s.token }));
        
        const newSubmission = new Submission({
            user: userId,
            problem: problem._id,
            code: code,
            language: language,
            status: "Judging", // Set to Judging immediately
            judge0Tokens: submissionTokens, // Store tokens to poll them
            results: [],
            testCases: testCases.map(tc => tc._id)
        });

        await newSubmission.save();

        return res.status(201).json(newSubmission); // Return our submission document

    } catch (error) {
        console.error("Submission Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({ message: `Submission failed: ${error.message}` });
    }
};

// --- GET SUBMISSION STATUS (GET /api/submissions/status/:submissionId) ---
export const getSubmissionStatus = async (req, res) => {
    try {
        const { submissionId } = req.params; // This is OUR DB's submission ID
        const userId = req.userId;

        const submission = await Submission.findOne({ _id: submissionId, user: userId });
        if (!submission) {
            return res.status(404).json({ message: "Submission not found." });
        }

        if (!submission.judge0Tokens || submission.judge0Tokens.length === 0) {
            
            submission.status = "Runtime Error"; 
            await submission.save();
            return res.status(400).json({ message: "Submission contains no Judge0 tokens." });
        }

        // If already completed, just return it
        if (submission.status === "Accepted" || submission.status.includes("Error") || submission.status.includes("Answer")) {
             return res.status(200).json(submission);
        }

        // --- Poll Judge0 for status ---
        // Create a comma-separated list of tokens
        const tokens = submission.judge0Tokens.map(t => t.token).join(',');
        
        const judge0Response = await axios.get(
            `https://${process.env.JUDGE0_API_HOST}/submissions/batch?tokens=${tokens}&base64_encoded=true&fields=status_id,stdout,stderr,compile_output,time,memory`,
            {
                headers: {
                    'x-rapidapi-key': process.env.JUDGE0_API_KEY,
                    'x-rapidapi-host': process.env.JUDGE0_API_HOST,
                }
            }
        );

        const results = judge0Response.data.submissions;
        
        // --- Process Results ---
        let finalStatus = "Accepted"; // Assume success
        const processedResults = [];
        let allProcessed = true;

        for (const [index, result] of results.entries()) {
            const testCaseId = submission.testCases[index]; // Assumes testCases were stored in submission

            let caseStatus = "Pending";
            if (result.status_id === 1 || result.status_id === 2) { // In Queue or Processing
                allProcessed = false;
                finalStatus = "Judging";
                caseStatus = "Judging";
            } else if (result.status_id === 3) { // Accepted
                caseStatus = "Passed";
            } else { // 4=WA, 5=TLE, 6=Compilation, 7-12=Runtime Error
                caseStatus = "Failed";
                // Set final status to the first error encountered
                if (finalStatus === "Accepted" || finalStatus === "Judging") {
                    finalStatus = result.status_id === 4 ? "Wrong Answer" :
                                  result.status_id === 5 ? "Time Limit Exceeded" :
                                  result.status_id === 6 ? "Compilation Error" : "Runtime Error";
                }
            }
            
             processedResults.push({
                 testCase: testCaseId,
                 status: caseStatus,
                 output: result.stdout ? Buffer.from(result.stdout, 'base64').toString('utf-8') : null,
                 // Add stderr, compile_output etc. if you need
             });
        }
        
        if (allProcessed) {
            submission.status = finalStatus;
        }
        submission.results = processedResults;
        await submission.save();

        return res.status(200).json(submission);

    } catch (error) {
        console.error("Get Status Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({ message: `Failed to get submission status: ${error.message}` });
    }
};

// --- GET SUBMISSIONS FOR PROBLEM (GET /api/submissions/problem/:slug) ---
export const getSubmissionsForProblem = async (req, res) => {
    try {
        const { slug } = req.params; // Get problem slug
        const userId = req.userId; // Get user ID from isAuth middleware

        // 1. Find the problem by slug to get its ID
        const problem = await Problem.findOne({ slug: slug }).select("_id");
        if (!problem) {
            return res.status(404).json({ message: "Problem not found." });
        }

        // 2. Find all submissions matching the problem ID and user ID
        const submissions = await Submission.find({
            problem: problem._id,
            user: userId
        })
        .select("status language createdAt") // Select only fields needed for the list
        .sort({ createdAt: -1 }); // Show newest first

        return res.status(200).json(submissions);

    } catch (error) {
        console.error("Error fetching submissions:", error);
        return res.status(500).json({ message: `Error fetching submissions: ${error.message}` });
    }
};