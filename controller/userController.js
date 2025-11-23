
import uploadOnCloudinary from "../config/cloudinary.js";
import User from "../models/userModel.js";
import AdminRequest from "../models/adminRequestModel.js";

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

// Get public user profile
export const getUserProfile = async (req, res) => {
  try {

    const { username } = req.params; 
    
    const user = await User.findOne({ username: username }).select(

      "name username description photoUrl github linkedin createdAt"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const pendingRequest = await AdminRequest.findOne({ 
      userId: user._id, 
      status: 'pending' 
    });

    const userObj = user.toObject();
    

    userObj.adminRequestStatus = pendingRequest ? 'pending' : 'none';


    return res.status(200).json(userObj); 

  } catch (error) {
    return res.status(500).json({ message: `GetUserProfile error ${error}` });
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