import Contest from "../models/contestModel.js";
import Problem from "../models/problemModel.js"; 
import ContestSubmission from "../models/contestSubmissionModel.js"; 
import ContestRanking from "../models/contestRankingModel.js";
import mongoose from "mongoose"

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

// --- CALCULATE RANKING (Admin/Master Only) ---
export const calculateRanking = async (req, res) => {
    const { slug } = req.params;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const contest = await Contest.findOne({ slug: slug }).session(session);
        if (!contest) {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ message: "Contest not found." });
        }

        //  Check if contest has actually ended
        if (new Date(contest.endTime) > new Date()) {
            return res.status(400).json({ message: "Contest has not ended yet." });
        }

        // Check if ranking is already calculated
        const existingRanking = await ContestRanking.findOne({ contest: contest._id }).session(session);
        if (existingRanking) {
            await session.commitTransaction(); session.endSession();
            return res.status(200).json(existingRanking);
        }

        // --- Start Calculation ---
        const submissions = await ContestSubmission.find({ contest: contest._id })
            .select("user problem status createdAt")
            .sort({ createdAt: 'asc' })
            .session(session);

        const contestStartTime = new Date(contest.startTime).getTime();
        const penaltyPerWrongSubmission = 20; 

        //  Process submissions user by user
        const userScores = new Map(); // Map<userId, { totalScore, totalPenalty, problemResults, user }>

        for (const sub of submissions) {
            const userId = sub.user.toString();
            const problemId = sub.problem.toString();
            
            
            if (!userScores.has(userId)) {
                userScores.set(userId, {
                    user: sub.user,
                    totalScore: 0,
                    totalPenalty: 0,
                    problemResults: new Map() // Map<problemId, { penalty, submissionTime, status }>
                });
            }

            const userData = userScores.get(userId);

            // If this problem is already 'Accepted', ignore subsequent submissions for it
            if (userData.problemResults.has(problemId) && userData.problemResults.get(problemId).status === 'Accepted') {
                continue;
            }

            const submissionTimeInMinutes = (new Date(sub.createdAt).getTime() - contestStartTime) / (1000 * 60);

            if (sub.status === 'Accepted') {
                // First time this problem is accepted
                const currentPenalty = userData.problemResults.get(problemId)?.penalty || 0;
                const finalPenalty = currentPenalty + submissionTimeInMinutes;

                userData.problemResults.set(problemId, {
                    status: 'Accepted',
                    submissionTime: submissionTimeInMinutes,
                    penalty: finalPenalty
                });

            } else if (sub.status !== 'Judging' && sub.status !== 'Pending') {
                // This is a 'Wrong Answer', 'TLE', 'Runtime Error', etc.
                const currentPenalty = userData.problemResults.get(problemId)?.penalty || 0;
                
                userData.problemResults.set(problemId, {
                    status: 'Attempted',
                    submissionTime: submissionTimeInMinutes,
                    penalty: currentPenalty + penaltyPerWrongSubmission 
                });
            }
        }

        //  Format and Sort Rankings
        let rankingsArray = [];
        for (const [userId, data] of userScores.entries()) {
            let userTotalScore = 0;
            let userTotalPenalty = 0;
            let formattedProblemResults = [];

            // Calculate totals from the processed problemResults map
            for(const [problemId, result] of data.problemResults.entries()) {
                if(result.status === 'Accepted') {
                    userTotalScore += 1; 
                    userTotalPenalty += result.penalty;
                    formattedProblemResults.push({
                        problem: problemId,
                        status: 'Accepted',
                        submissionTime: result.submissionTime,
                        penalty: result.penalty
                    });
                }
            }

            if (userTotalScore > 0) { // Only add users who solved at least one problem
                rankingsArray.push({
                    user: data.user,
                    totalScore: userTotalScore,
                    totalPenalty: userTotalPenalty,
                    problemResults: formattedProblemResults
                });
            }
        }

        // Sort: 1. By score (descending), 2. By penalty (ascending)
        rankingsArray.sort((a, b) => {
            if (a.totalScore !== b.totalScore) {
                return b.totalScore - a.totalScore;
            }
            return a.totalPenalty - b.totalPenalty;
        });

        // Assign ranks
        const finalRankings = rankingsArray.map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));

        // 4. Save to DB
        const newRanking = new ContestRanking({
            contest: contest._id,
            rankings: finalRankings,
            calculatedAt: new Date()
        });
        await newRanking.save({ session });

        await session.commitTransaction();
        session.endSession();
        
        return res.status(201).json(newRanking);

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error calculating ranking:", error);
        return res.status(500).json({ message: `Error calculating ranking: ${error.message}` });
    }
};

// --- GET RANKING (Public) ---
export const getRanking = async (req, res) => {
    try {
        const { slug } = req.params;
        const contest = await Contest.findOne({ slug: slug }).select("_id");
        if (!contest) {
            return res.status(404).json({ message: "Contest not found." });
        }

        // Find the calculated ranking
        const ranking = await ContestRanking.findOne({ contest: contest._id })
            .populate({
                path: 'rankings.user', 
                select: 'name username photoUrl' 
            })
            .populate({
                path: 'rankings.problemResults.problem', 
                select: 'title slug' 
            });
            
        if (!ranking) {
            return res.status(404).json({ message: "Ranking for this contest has not been calculated yet." });
        }

        return res.status(200).json(ranking);

    } catch (error) {
        console.error("Error fetching ranking:", error);
        return res.status(500).json({ message: `Error fetching ranking: ${error.message}` });
    }
};