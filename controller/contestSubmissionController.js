import ContestSubmission from "../models/contestSubmissionModel.js";
import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js";
import { submissionQueue } from "../config/queue.js"; 

// --- CREATE CONTEST SUBMISSION (Producer) ---
export const createContestSubmission = async (req, res) => {
    const { slug, problemSlug, language, code } = req.body;
    const userId = req.userId;

    if (!language || !code || !slug || !problemSlug) {
        return res.status(400).json({ message: "Contest, problem, language, and code are required." });
    }

    try {
        //  --- Contest & User validation---
        const contest = await Contest.findOne({ slug: slug });
        if (!contest) return res.status(404).json({ message: "Contest not found." });

        const now = new Date(); 
        if (now < contest.startTime) return res.status(400).json({ message: "Contest has not started." });
        if (now > contest.endTime) return res.status(400).json({ message: "Contest has ended." });

        if (!contest.registeredUsers.includes(userId)) {
            return res.status(403).json({ message: "You are not registered for this contest." });
        }

        // --- problem validation ---
        const problem = await Problem.findOne({ slug: problemSlug }).select("_id score");
        if (!problem) return res.status(404).json({ message: "Problem not found." });
        
        // Ensure this problem is actually in the contest
        const isProblemInContest = contest.problems.some(p => p.problem.equals(problem._id));
        if (!isProblemInContest) return res.status(400).json({ message: "This problem is not part of this contest." });

        //  ---  Placeholder Submission ---
        const newSubmission = new ContestSubmission({
            user: userId,
            problem: problem._id,
            contest: contest._id, 
            code: code,
            language: language,
            status: "Queued", 
            judge0Tokens: [],
            results: [],
            score: 0,
            submissionTime: now
        });

        await newSubmission.save();

        // --- Push to Queue ---
        await submissionQueue.add("process-submission", {
            submissionId: newSubmission._id,
            code,
            language,
            slug: problemSlug, 
            userId,
            isContest: true 
        });

        // --- Return Immediate Response ---
        return res.status(201).json(newSubmission); 

    } catch (error) {
        console.error("Contest Submission Error:", error);
        return res.status(500).json({ message: `Submission failed: ${error.message}` });
    }
};

// --- GET CONTEST SUBMISSION STATUS (Read-Only) ---
export const getContestSubmissionStatus = async (req, res) => {
    try {
        const { submissionId } = req.params; 
        const userId = req.userId;

        const submission = await ContestSubmission.findOne({ _id: submissionId, user: userId });
        
        if (!submission) {
            return res.status(404).json({ message: "Contest submission not found." });
        }

        return res.status(200).json(submission);

    } catch (error) {
        console.error("Get Contest Status Error:", error);
        return res.status(500).json({ message: error.message });
    }
};

// --- GET ALL SUBMISSIONS FOR A PROBLEM ---
export const getSubmissionsForProblem = async (req, res) => {
    try {
        const { slug } = req.params; 
        const userId = req.userId;   
        
        const problem = await Problem.findOne({ slug: slug }).select("_id");
        if (!problem) {
            return res.status(404).json({ message: "Problem not found." });
        }

        const submissions = await ContestSubmission.find({
            problem: problem._id,
            user: userId
        })
        .select("status language score createdAt") 
        .sort({ createdAt: -1 }); 

        return res.status(200).json(submissions);

    } catch (error) {
        console.error("Error fetching submissions for problem:", error);
        return res.status(500).json({ message: `Error fetching submissions: ${error.message}` });
    }
};