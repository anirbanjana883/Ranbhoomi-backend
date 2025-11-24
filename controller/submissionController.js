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
        // cpu_time_limit: 2,
        // memory_limit: 128000
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

        // 2. Find Problem (Fetch _id AND driverCode)
        // We specifically select driverCode so we can merge it
        const problem = await Problem.findOne({ slug: slug }).select("_id driverCode");
        
        if (!problem) {
            return res.status(404).json({ message: "Problem not found." });
        }

        // --- THE MAGIC: Merge User Code + Driver Code ---
        let finalSourceCode = code;

        if (problem.driverCode && problem.driverCode.length > 0) {
            // Find driver code for this specific language
            const driver = problem.driverCode.find(
                (dc) => dc.language.toLowerCase() === language.toLowerCase()
            );

            if (driver) {
                // Append driver code to user code
                finalSourceCode = `${code}\n\n${driver.code}`;
                console.log(`Merged driver code for ${language}`);
            }
        }
        // -----------------------------------------------

        const testCases = await TestCase.find({ problem: problem._id });
        if (!testCases || testCases.length === 0) {
            return res.status(400).json({ message: "Problem has no test cases." });
        }

        // 3. Format data for Judge0 using the FINAL MERGED CODE
        const submissions = formatSubmissions(finalSourceCode, languageId, testCases);
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

        // 5. Create Submission in DB
        const submissionTokens = judge0Response.data.map(s => ({ token: s.token }));
        
        const newSubmission = new Submission({
            user: userId,
            problem: problem._id,
            code: code, // IMPORTANT: Save ONLY user's code to DB (history), not the merged one!
            language: language,
            status: "Judging",
            judge0Tokens: submissionTokens,
            results: [],
            testCases: testCases.map(tc => tc._id)
        });

        await newSubmission.save();

        return res.status(201).json(newSubmission);

    } catch (error) {
        console.error("Submission Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({ message: `Submission failed: ${error.message}` });
    }
};

// --- GET SUBMISSION STATUS ---
export const getSubmissionStatus = async (req, res) => {
    try {
        const { submissionId } = req.params;
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

        if (submission.status === "Accepted" || submission.status.includes("Error") || submission.status.includes("Answer")) {
             return res.status(200).json(submission);
        }

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
        
        let finalStatus = "Accepted";
        const processedResults = [];
        let allProcessed = true;

        for (const [index, result] of results.entries()) {
            const testCaseId = submission.testCases[index]; 

            let caseStatus = "Pending";
            if (result.status_id === 1 || result.status_id === 2) { 
                allProcessed = false;
                finalStatus = "Judging";
                caseStatus = "Judging";
            } else if (result.status_id === 3) { 
                caseStatus = "Passed";
            } else { 
                caseStatus = "Failed";
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

// --- GET SUBMISSIONS FOR PROBLEM ---
export const getSubmissionsForProblem = async (req, res) => {
    try {
        const { slug } = req.params; 
        const userId = req.userId; 

        const problem = await Problem.findOne({ slug: slug }).select("_id");
        if (!problem) {
            return res.status(404).json({ message: "Problem not found." });
        }

        const submissions = await Submission.find({
            problem: problem._id,
            user: userId
        })
        .select("status language createdAt") 
        .sort({ createdAt: -1 }); 

        return res.status(200).json(submissions);

    } catch (error) {
        console.error("Error fetching submissions:", error);
        return res.status(500).json({ message: `Error fetching submissions: ${error.message}` });
    }
};