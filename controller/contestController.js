import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js"; 
import ContestSubmission from "../models/contestSubmissionModel.js"; 
import ContestRanking from "../models/contestRankingModel.js";
import mongoose from "mongoose"

// --- HELPER: LOGIC TO CALCULATE RANKS (Reused for Live & Final) ---
const performRankingCalculation = async (contestId, startTime) => {
    // Fetch all relevant submissions
    const submissions = await ContestSubmission.find({ contest: contestId })
        .select("user problem status createdAt points")
        .sort({ createdAt: 'asc' });

    const contestStart = new Date(startTime).getTime();
    const penaltyPerWrong = 20; 

    // Map<userId, { user, totalScore, totalPenalty, problemResults }>
    const userScores = new Map(); 

    for (const sub of submissions) {
        const userId = sub.user.toString();
        const problemId = sub.problem.toString();
        
        if (!userScores.has(userId)) {
            userScores.set(userId, {
                user: sub.user, 
                totalScore: 0,
                totalPenalty: 0,
                problemResults: new Map() 
            });
        }

        const userData = userScores.get(userId);

        // If already accepted, skip future submissions for this problem
        if (userData.problemResults.has(problemId) && userData.problemResults.get(problemId).status === 'Accepted') {
            continue;
        }

        // Calculate time taken in minutes
        const submissionTimeInMinutes = Math.max(0, (new Date(sub.createdAt).getTime() - contestStart) / (1000 * 60));

        if (sub.status === 'Accepted') {
            const currentPenalty = userData.problemResults.get(problemId)?.penalty || 0;
            const finalPenalty = currentPenalty + submissionTimeInMinutes;

            userData.problemResults.set(problemId, { status: 'Accepted', penalty: finalPenalty });
            
            // Update Totals
            userData.totalScore += (sub.points || 10); // Default 10 if points missing
            userData.totalPenalty += finalPenalty;

        } else if (sub.status !== 'Judging' && sub.status !== 'Pending') {
            // Wrong Answer penalty
            const currentPenalty = userData.problemResults.get(problemId)?.penalty || 0;
            userData.problemResults.set(problemId, { 
                status: 'Attempted', 
                penalty: currentPenalty + penaltyPerWrong 
            });
        }
    }

    // Convert Map to Array
    const rankingsArray = Array.from(userScores.values()).map(u => ({
        user: u.user,
        totalScore: u.totalScore,
        totalPenalty: Math.round(u.totalPenalty),
        problemResults: Array.from(u.problemResults.entries()).map(([p, data]) => ({
            problem: p,
            ...data
        }))
    }));

    // Sort: High Score > Low Penalty
    rankingsArray.sort((a, b) => {
        if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
        return a.totalPenalty - b.totalPenalty;
    });

    // Assign Ranks (1st, 2nd, 3rd...)
    return rankingsArray.map((entry, index) => ({ ...entry, rank: index + 1 }));
};

// --- CREATE CONTEST (Admin/Master Only) ---
export const createContest = async (req, res) => {
    try {
        const { title, description, startTime, endTime, problemIds } = req.body;
        const createdBy = req.userId; 

        // --- Basic Validation ---
        if (!title || !description || !startTime || !endTime) {
            return res.status(400).json({ message: "Title, description, start time, and end time are required." });
        }

        // --- Slug Generation ---
        const slug = title.toLowerCase()
                          .replace(/\s+/g, '-')
                          .replace(/[^\w-]+/g, '');

        // --- Check for Duplicate Title/Slug ---
        const existingContest = await Contest.findOne({ $or: [{ title }, { slug }] });
        if (existingContest) {
            return res.status(400).json({ message: "A contest with this title or slug already exists." });
        }

        // --- Validate Problems ---
        if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
            return res.status(400).json({ message: "At least one problem ID is required." });
        }

        // Check if all problem IDs are valid and exist in the Problem collection
        const foundProblems = await Problem.find({ '_id': { $in: problemIds } }).select("_id");
        if (foundProblems.length !== problemIds.length) {
            // Find which problems were not found (for a better error message)
            const foundIds = foundProblems.map(p => p._id.toString());
            const missingIds = problemIds.filter(id => !foundIds.includes(id));
            return res.status(400).json({ message: `The following problem IDs are invalid or not found: ${missingIds.join(', ')}` });
        }

        // Format problems for the schema
        const problems = problemIds.map(id => ({ problem: id }));

        // --- Create Contest ---
        const newContest = new Contest({
            title,
            slug,
            description,
            startTime,
            endTime,
            problems,
            createdBy,
            registeredUsers: [] // Starts empty
        });

        await newContest.save(); 

        return res.status(201).json(newContest);

    } catch (error) {
        
        console.error("Error creating contest:", error);
        return res.status(500).json({ message: `Error creating contest: ${error.message}` });
    }
};

// --- GET ALL CONTESTS (Public) ---
export const getAllContests = async (req, res) => {
    try {
        const now = new Date();

        // Fetch all contests, split into categories
        const allContests = await Contest.find({})
                                         .select("title slug description startTime endTime")
                                         .sort({ startTime: -1 }); // Newest start times first

        // Categorize them
        const upcoming = allContests.filter(c => new Date(c.startTime) > now);
        const live = allContests.filter(c => new Date(c.startTime) <= now && new Date(c.endTime) > now);
        const past = allContests.filter(c => new Date(c.endTime) <= now);

        return res.status(200).json({ upcoming, live, past });

    } catch (error) {
        console.error("Error fetching contests:", error);
        return res.status(500).json({ message: `Error fetching contests: ${error.message}` });
    }
};

// --- GET SINGLE CONTEST DETAILS (Auth User) ---
export const getContestDetails = async (req, res) => {
    try {
        const { slug } = req.params;
        const userId = req.userId; 

        //  Find the contest and populate its problems in one query
        const contest = await Contest.findOne({ slug: slug })
            .populate({
                path: 'problems.problem',
                select: 'title slug difficulty tags isPremium' 
            });

        if (!contest) {
            return res.status(404).json({ message: "Contest not found." });
        }
        
        //  Safely check if the user is registered.
        let isRegistered = false;
        if (userId && contest.registeredUsers) {
            isRegistered = contest.registeredUsers.some(id => id.equals(userId));
        }

        //  Convert to a plain object to add/remove fields
        const contestObject = contest.toObject();

        //  Add our new 'isRegistered' field
        contestObject.isRegistered = isRegistered;
        
        //  Securely remove the full list of registered users before sending
        delete contestObject.registeredUsers; 

        return res.status(200).json(contestObject);

    } catch (error) {
        console.error("Error fetching contest details:", error);
        return res.status(500).json({ message: `Error fetching details: ${error.message}` });
    }
};

// --- REGISTER FOR CONTEST (Auth User) ---
export const registerForContest = async (req, res) => {
    try {
        const { slug } = req.params;
        const userId = req.userId;

        const contest = await Contest.findOne({ slug: slug });
        if (!contest) {
            return res.status(404).json({ message: "Contest not found." });
        }

        
        if (new Date(contest.startTime) <= new Date()) {
            return res.status(400).json({ message: "Registration is closed. This contest is already live or has ended." });
        }

        
        if (contest.registeredUsers.includes(userId)) {
            return res.status(400).json({ message: "You are already registered for this contest." });
        }

        
        contest.registeredUsers.push(userId);
        await contest.save();

        return res.status(200).json({ message: "Successfully registered for the contest!" });

    } catch (error) {
        console.error("Error registering for contest:", error);
        return res.status(500).json({ message: `Error registering: ${error.message}` });
    }
};

// --- DELETE CONTEST (Admin/Master Only) ---
export const deleteContest = async (req, res) => {
    const { slug } = req.params;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const contest = await Contest.findOneAndDelete({ slug: slug }).session(session);
        if (!contest) {
            await session.commitTransaction();
            session.endSession();
            return res.status(404).json({ message: "Contest not found." });
        }

        // Optional: Delete associated contest submissions
        await ContestSubmission.deleteMany({ contest: contest._id }).session(session);

        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({ message: "Contest deleted successfully." });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error deleting contest:", error);
        return res.status(500).json({ message: `Error deleting contest: ${error.message}` });
    }
};

// --- UPDATE CONTEST (Admin/Master Only) ---
export const updateContest = async (req, res) => {
    const { slug } = req.params; 
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { title, description, startTime, endTime, problemIds } = req.body;
        const updatedBy = req.userId; 

        // --- Find the existing contest ---
        const contest = await Contest.findOne({ slug: slug }).session(session);
        if (!contest) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Contest not found." });
        }

        // --- Basic Validation ---
        if (!title || !description || !startTime || !endTime) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Title, description, start time, and end time are required." });
        }

        // --- Handle Title/Slug Change ---
        let newSlug = contest.slug;
        if (title && title !== contest.title) {
            newSlug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
            // Check if new slug is taken by *another* contest
            const existing = await Contest.findOne({ slug: newSlug, _id: { $ne: contest._id } }).session(session);
            if (existing) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: `Another contest already exists with the title/slug '${title}'.` });
            }
            contest.title = title;
            contest.slug = newSlug;
        }

        // --- Validate Problems ---
        if (!problemIds || !Array.isArray(problemIds) || problemIds.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "At least one problem ID is required." });
        }

        const foundProblems = await Problem.find({ '_id': { $in: problemIds } }).session(session).select("_id");
        if (foundProblems.length !== problemIds.length) {
            const foundIds = foundProblems.map(p => p._id.toString());
            const missingIds = problemIds.filter(id => !foundIds.includes(id));
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Invalid problem IDs: ${missingIds.join(', ')}` });
        }

        // Format problems for the schema
        const problems = problemIds.map(id => ({ problem: id }));

        // --- Update Contest Fields ---
        contest.description = description;
        contest.startTime = startTime;
        contest.endTime = endTime;
        contest.problems = problems;
        // createdBy remains the same, but you could add an 'updatedBy' field if you want
        
        await contest.save(); 

        // --- Commit and Send ---
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json(contest); 

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error updating contest:", error);
        return res.status(500).json({ message: `Error updating contest: ${error.message}` });
    }
};

// --- CALCULATE RANKING (Finalize for Past Contests) ---
export const calculateRanking = async (req, res) => {
    const { slug } = req.params;
    try {
        const contest = await Contest.findOne({ slug });
        if (!contest) return res.status(404).json({ message: "Contest not found." });

        // Calculate using helper
        const rankings = await performRankingCalculation(contest._id, contest.startTime);

        // Save permanently to DB
        const newRanking = await ContestRanking.findOneAndUpdate(
            { contest: contest._id },
            { 
                contest: contest._id,
                rankings: rankings,
                calculatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        return res.status(200).json(newRanking);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// --- GET RANKING (Live & Past) ---
export const getRanking = async (req, res) => {
    try {
        const { slug } = req.params;
        const contest = await Contest.findOne({ slug });
        if (!contest) return res.status(404).json({ message: "Contest not found." });

        // 1. Try to find a SAVED ranking (Past Contests)
        const savedRanking = await ContestRanking.findOne({ contest: contest._id })
            .populate('rankings.user', 'name username photoUrl')
            .populate('rankings.problemResults.problem', 'title slug');

        if (savedRanking) {
            return res.status(200).json(savedRanking);
        }

        // 2. If no saved ranking, calculate LIVE (In-Memory)
        const liveRankings = await performRankingCalculation(contest._id, contest.startTime);
        
        // Populate User Details for the Live Data
        const populatedRankings = await ContestSubmission.populate(liveRankings, {
            path: 'user',
            select: 'name username photoUrl'
        });

        // Return structure matching the frontend expectation
        return res.status(200).json({
            contest: contest._id,
            rankings: populatedRankings
        });

    } catch (error) {
        console.error("Error fetching ranking:", error);
        return res.status(500).json({ message: error.message });
    }
};