import Submission from "../models/submissionModel.js";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js"; 
import axios from "axios";
import { submissionQueue } from "../config/queue.js"; 

// --- CREATE SUBMISSION ---
export const createSubmission = async (req, res) => {
    const { slug, language, code } = req.body;
    const userId = req.userId;

    if (!language || !code || !slug) {
        return res.status(400).json({ message: "Invalid input." });
    }

    try {
        // 1. Verify Problem Exists
        const problem = await Problem.findOne({ slug }).select("_id");
        if (!problem) return res.status(404).json({ message: "Problem not found." });

        // 2. Create "Placeholder" Submission in DB
        const newSubmission = new Submission({
            user: userId,
            problem: problem._id,
            code: code,
            language: language,
            status: "Queued", // New Status!
            judge0Tokens: [],
            results: []
        });
        await newSubmission.save();

        // 3. Add to Redis Queue ⚡
        await submissionQueue.add("process-submission", {
            submissionId: newSubmission._id,
            code,
            language,
            slug
        });

        // 4. Return immediately!
        return res.status(201).json(newSubmission);

    } catch (error) {
        console.error("Queue Error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

// --- GET SUBMISSION STATUS  ---
export const getSubmissionStatus = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const userId = req.userId;

        const submission = await Submission.findOne({ _id: submissionId, user: userId });
        if (!submission) return res.status(404).json({ message: "Not found." });

        
        if (submission.status === "Queued") {
            return res.status(200).json({ 
                status: "Queued", 
                message: "Waiting for worker..." 
            });
        }

        
        if (!submission.judge0Tokens || submission.judge0Tokens.length === 0) {
            return res.status(400).json({ message: "No tokens found." });
        }

        if (["Accepted", "Wrong Answer", "Time Limit Exceeded", "Compilation Error", "Runtime Error"].includes(submission.status)) {
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
        let allProcessed = true;
        
        const processedResults = [];

        
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
                 if (["Accepted", "Judging"].includes(finalStatus)) {
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
        return res.status(500).json({ message: error.message });
    }
};

// ...  getSubmissionsForProblem  ...
export const getSubmissionsForProblem = async (req, res) => {
    // ... (Your existing code is fine) ...
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