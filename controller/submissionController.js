import Submission from "../models/submissionModel.js";
import Problem from "../models/problemModel.js";
import { submissionQueue } from "../config/queue.js";

// --- CREATE SUBMISSION (Producer) ---
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
            status: "Queued", // Starts as Queued
            judge0Tokens: [],
            results: []
        });
        await newSubmission.save();

        // 3. Add to Redis Queue
        // The Worker will pick this up and handle ALL Judge0 communication
        await submissionQueue.add("process-submission", {
            submissionId: newSubmission._id,
            code,
            language,
            slug,
            userId // Pass userId so Worker can send Socket event
        });

        // 4. Return immediately!
        return res.status(201).json(newSubmission);

    } catch (error) {
        console.error("Queue Error:", error);
        return res.status(500).json({ message: "Server error" });
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
        return res.status(200).json(submission);

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// ... GET SUBMISSION FOR PROBLEM ...
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
        .select("status language createdAt score") 
        .sort({ createdAt: -1 });

        return res.status(200).json(submissions);

    } catch (error) {
        console.error("Error fetching submissions:", error);
        return res.status(500).json({ message: "Server error" });
    }
};