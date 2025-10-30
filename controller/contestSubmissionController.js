import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import ContestSubmission from "../models/contestSubmissionModel.js"; 
import { getLanguageId } from "../config/languageIds.js";
import axios from "axios";

// Helper to format data for Judge0
const formatSubmissions = (code, languageId, testCases) => {
    return testCases.map(tc => ({
        source_code: Buffer.from(code).toString('base64'),
        language_id: languageId,
        stdin: Buffer.from(tc.input).toString('base64'),
        expected_output: Buffer.from(tc.expectedOutput).toString('base64'),
    }));
};

// --- CREATE CONTEST SUBMISSION ---
export const createContestSubmission = async (req, res) => {
    const { slug, problemSlug, language, code } = req.body;
    const userId = req.userId;

    if (!language || !code || !slug || !problemSlug) {
        return res.status(400).json({ message: "Contest, problem, language, and code are required." });
    }

    try {
        // --- Validate Contest and User Registration ---
        const contest = await Contest.findOne({ slug: slug });
        if (!contest) return res.status(404).json({ message: "Contest not found." });

        const now = Date.now();
        if (now < contest.startTime) return res.status(400).json({ message: "Contest has not started." });
        if (now > contest.endTime) return res.status(400).json({ message: "Contest has ended." });

        if (!contest.registeredUsers.includes(userId)) {
            return res.status(403).json({ message: "You are not registered for this contest." });
        }

        // --- Get Language ID ---
        const languageId = getLanguageId(language);
        if (!languageId) return res.status(400).json({ message: `Language '${language}' is not supported.` });

        // --- Find Problem and ALL Test Cases ---
        const problem = await Problem.findOne({ slug: problemSlug }).select("_id");
        if (!problem) return res.status(404).json({ message: "Problem not found." });
        
        // Ensure this problem is part of the contest
        const isProblemInContest = contest.problems.some(p => p.problem.equals(problem._id));
        if (!isProblemInContest) return res.status(400).json({ message: "This problem is not part of this contest." });

        const testCases = await TestCase.find({ problem: problem._id });
        if (!testCases || testCases.length === 0) {
            return res.status(400).json({ message: "Problem has no test cases." });
        }

        // --- 4. Post to Judge0 ---
        const submissions = formatSubmissions(code, languageId, testCases);
        const judge0Payload = { submissions };
        
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

        // --- "Pending" ContestSubmission in our DB ---
        const submissionTokens = judge0Response.data.map(s => ({ token: s.token }));
        
        const newSubmission = new ContestSubmission({
            user: userId,
            problem: problem._id,
            contest: contest._id, 
            code: code,
            language: language,
            status: "Judging",
            judge0Tokens: submissionTokens,
            testCases: testCases.map(tc => tc._id),
            results: [],
            submissionTime: new Date() 
        });

        await newSubmission.save();

        //  We'll need a *separate* polling endpoint for contest submissions
        return res.status(201).json(newSubmission); 

    } catch (error) {
        console.error("Contest Submission Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({ message: `Submission failed: ${error.message}` });
    }
};

// --- GET CONTEST SUBMISSION STATUS ---
export const getContestSubmissionStatus = async (req, res) => {
    try {
        const { submissionId } = req.params; 
        const userId = req.userId;

        // Find the submission, ensuring it belongs to the logged-in user
        const submission = await ContestSubmission.findOne({ _id: submissionId, user: userId });
        if (!submission) {
            return res.status(404).json({ message: "Contest submission not found." });
        }

        // Check for tokens 
        if (!submission.judge0Tokens || submission.judge0Tokens.length === 0) {
            submission.status = "Runtime Error";
            await submission.save();
            return res.status(400).json({ message: "Submission contains no Judge0 tokens." });
        }

        // If judging is already complete, just return the saved result
        if (submission.status !== "Judging" && submission.status !== "Pending") {
             return res.status(200).json(submission);
        }

        //  Poll Judge0 for the status 
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
        
        //  Process Results 
        let finalStatus = "Accepted"; 
        const processedResults = [];
        let allProcessed = true; 

        for (const [index, result] of results.entries()) {
            // Get the corresponding test case ID from our stored array
            const testCaseId = submission.testCases[index]; 
            
            let caseStatus = "Pending";
            let output = null;

            if (result.status_id === 1 || result.status_id === 2) { 
                allProcessed = false; 
                finalStatus = "Judging";
                caseStatus = "Judging";
            } else if (result.status_id === 3) { 
                caseStatus = "Passed";
                output = result.stdout ? Buffer.from(result.stdout, 'base64').toString('utf-8') : null;
            } else { 
                caseStatus = "Failed";
                output = result.stdout ? Buffer.from(result.stdout, 'base64').toString('utf-8') : null;
                // Set final status to the first error encountered
                if (finalStatus === "Accepted" || finalStatus === "Judging") {
                    switch (result.status_id) {
                        case 4: finalStatus = "Wrong Answer"; break;
                        case 5: finalStatus = "Time Limit Exceeded"; break;
                        case 6: finalStatus = "Compilation Error"; break;
                        default: finalStatus = "Runtime Error";
                    }
                }
            }
            
             processedResults.push({
                 testCase: testCaseId,
                 status: caseStatus,
                 output: output,
                 // wiil implement more field here e.g., result.time, result.memory
             });
        }
        
        // Only update the final status if all test cases are processed
        if (allProcessed) {
            submission.status = finalStatus;
        }
        
        submission.results = processedResults;
        await submission.save();

        return res.status(200).json(submission);

    } catch (error) {
        console.error("Get Contest Status Error:", error.response ? error.response.data : error.message);
        return res.status(500).json({ message: `Failed to get submission status: ${error.message}` });
    }
};

// --- GET CONTEST SUBMISSION STATUS FOR PROBLEMS  ---
export const getSubmissionsForProblem = async (req, res) => {
    try {
        const { slug } = req.params; 
        const userId = req.userId;   
        //  Find the problem by slug to get its ID
        const problem = await Problem.findOne({ slug: slug }).select("_id");
        if (!problem) {
            return res.status(404).json({ message: "Problem not found." });
        }

        //  Find all contest submissions for this user AND this problem
        const submissions = await ContestSubmission.find({
            problem: problem._id,
            user: userId
        })
        .select("status language createdAt") 
        .sort({ createdAt: -1 }); 

        return res.status(200).json(submissions);

    } catch (error) {
        console.error("Error fetching submissions for problem:", error);
        return res.status(500).json({ message: `Error fetching submissions: ${error.message}` });
    }
};