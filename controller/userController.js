
import uploadOnCloudinary from "../config/cloudinary.js";
import User from "../models/userModel.js";
import AdminRequest from "../models/adminRequestModel.js";
import Submission from "../models/submissionModel.js"
import Problem from "../models/problemModel.js";
import ContestRanking from "../models/contestRankingModel.js";

// get current user
export const getCurrentUser = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await User.findById(req.userId).select("-password")
    if (!user) {
      return res.status(404).json({ message: "user not found" });
    }
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: `GetCurrentUser error ${error}` });
  }
};

// update profile
export const updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const { description, name, username, github, linkedin } = req.body;
    let photoUrl;

    if (req.file) {

      photoUrl = await uploadOnCloudinary(req.file.path); 
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Conditionally update each field
    if (name !== undefined) user.name = name;
    if (description !== undefined) user.description = description;
    if (github !== undefined) user.github = github;
    if (linkedin !== undefined) user.linkedin = linkedin;
    if (photoUrl) user.photoUrl = photoUrl;

    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username: username });
      if (existingUser) {
        return res.status(400).json({ message: "Username is already taken." });
      }
      user.username = username;
    }

    await user.save(); 

    const updatedUser = await User.findById(userId).select("-password");
    return res.status(200).json(updatedUser);

  } catch (error) {
    // Handle potential duplicate username error
    if (error.code === 11000 && error.keyPattern && error.keyPattern.username) {
      return res.status(400).json({ message: "Username is already taken." });
    }
    return res.status(500).json({ message: `Update profile error ${error}` });
  }
};

// --- GET USER PROFILE (Handles both Dashboard & Public View) ---
export const getUserProfile = async (req, res) => {
  try {
    const { username } = req.params;
    let user;

    // 1. Determine which user to find
    if (username) {
      user = await User.findOne({ username: username }).select(
        "name username description photoUrl github linkedin createdAt role"
      );
    } else {
      user = await User.findById(req.userId).select("-password");
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Check Admin Request Status (Private only)
    let adminStatus = 'none';
    if (!username) {
        try {
            const pendingRequest = await AdminRequest.findOne({ 
                userId: user._id, 
                status: 'pending' 
            });
            if (pendingRequest) adminStatus = 'pending';
        } catch (err) {}
    }

    const userObj = user.toObject();
    userObj.adminRequestStatus = adminStatus;

    // ---------------------------------------------------------
    // 3. CALCULATE "PRO" STATS
    // ---------------------------------------------------------
    
    // A. Submissions & Solved Counts
    const submissions = await Submission.find({ user: user._id })
      .populate("problem", "difficulty title slug") 
      .sort({ createdAt: -1 });

    const solvedProblemIds = new Set();
    let easy = 0, medium = 0, hard = 0, superHard = 0;

    submissions.forEach((sub) => {
      if (sub.status === "Accepted" && sub.problem) {
        const probId = sub.problem._id.toString();
        if (!solvedProblemIds.has(probId)) {
          solvedProblemIds.add(probId);
          const diff = sub.problem.difficulty;
          if (diff === "Easy") easy++;
          else if (diff === "Medium") medium++;
          else if (diff === "Hard") hard++;
          else if (diff === "Super Hard") superHard++;
        }
      }
    });

    // B. Heatmap Data
    const submissionMap = {};
    submissions.forEach((sub) => {
      const date = sub.createdAt.toISOString().split("T")[0];
      submissionMap[date] = (submissionMap[date] || 0) + 1;
    });

    const heatmapData = Object.keys(submissionMap).map((date) => ({
      date,
      count: submissionMap[date],
    }));

    // C. Recent Submissions
    const recentActivity = submissions.slice(0, 5).map((sub) => ({
      _id: sub._id,
      title: sub.problem ? sub.problem.title : "Deleted Problem",
      slug: sub.problem ? sub.problem.slug : "#",
      status: sub.status,
      date: sub.createdAt,
      language: sub.language
    }));

    // --- D. NEW: CONTEST HISTORY ---
    // Find all rankings where this user is listed
    const contestRankings = await ContestRanking.find({
      "rankings.user": user._id
    }).populate("contest", "title slug startTime");

    const contestHistory = contestRankings.map(cr => {
        if (!cr.contest) return null; // Handle deleted contests
        
        // Find specific user rank in this contest
        const userEntry = cr.rankings.find(r => r.user.toString() === user._id.toString());
        if (!userEntry) return null;

        return {
            contestId: cr.contest._id,
            title: cr.contest.title,
            slug: cr.contest.slug,
            date: cr.contest.startTime,
            rank: userEntry.rank,
            score: userEntry.totalScore,
            totalParticipants: cr.rankings.length
        };
    })
    .filter(c => c !== null)
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

    // ---------------------------------------------------------
    // 4. Send Response
    // ---------------------------------------------------------
    return res.status(200).json({ 
      user: userObj,
      stats: {
        totalSolved: solvedProblemIds.size,
        easy,
        medium,
        hard,
        superHard,
        heatmap: heatmapData,
        recent: recentActivity,
        contestHistory: contestHistory // <-- Added this
      }
    });

  } catch (error) {
    console.error("Profile Error:", error);
    return res.status(500).json({ message: `GetUserProfile error: ${error.message}` });
  }
};

// Find all accepted submissions for this user
export const getSolvedProblems = async (req, res) => {
  try {
    // Find all accepted submissions for this user
    const submissions = await Submission.find({ 
      user: req.userId, 
      status: "Accepted" 
    }).select("problem");

    // Extract just the problem IDs and make them unique
    // (User might have solved the same problem twice)
    const solvedProblemIds = [...new Set(submissions.map(s => s.problem.toString()))];

    res.status(200).json(solvedProblemIds);
  } catch (error) {
    console.error("Error fetching solved problems:", error);
    res.status(500).json({ message: "Server error" });
  }
};

