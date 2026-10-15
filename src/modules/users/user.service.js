import userRepository from "./user.repository.js";
import { uploadOnCloudinary } from "../../core/cloudinary.js";
import { sendMail } from "../../core/mailer.js";
import { ApiError } from "../../shared/utils/ApiError.js";

// Placeholders for cross-module queries (will map to correct files in later phases)
// import Submission from "../problems/submission.model.js";
// import ContestRanking from "../contests/contestRanking.model.js";

class UserService {
  async updateProfile(userId, updateData, file) {
    const user = await userRepository.findById(userId);
    if (!user) throw new ApiError(404, "User not found");

    if (file) user.photoUrl = await uploadOnCloudinary(file.path);
    if (updateData.name) user.name = updateData.name;
    if (updateData.description) user.description = updateData.description;
    if (updateData.github !== undefined) user.github = updateData.github;
    if (updateData.linkedin !== undefined) user.linkedin = updateData.linkedin;

    if (updateData.username && updateData.username !== user.username) {
      const existing = await userRepository.findByUsername(updateData.username);
      if (existing) throw new ApiError(400, "Username is already taken");
      user.username = updateData.username;
    }

    await userRepository.save(user);
    return userRepository.findByIdWithoutPassword(userId);
  }

  async getUserProfileData(identifier, isUsername = false) {
    const user = isUsername 
      ? await userRepository.findByUsername(identifier)
      : await userRepository.findByIdWithoutPassword(identifier);
    
    if (!user) throw new ApiError(404, "User not found");
    const userObj = user.toObject();
    delete userObj.password;

    userObj.adminRequestStatus = 'none';
    if (!isUsername) {
      const pending = await userRepository.findPendingRequest(user._id);
      if (pending) userObj.adminRequestStatus = 'pending';
    }

    // Temporary mock data until Phase 3/6 imports are ready
    const solvedIds = new Set();
    const stats = { easy: 0, medium: 0, hard: 0, superHard: 0 };
    const contestHistory = [];

    return { user: userObj, stats: { totalSolved: solvedIds.size, ...stats, contestHistory } };
  }

  async requestAdminAccess(userId, reason) {
    if (await userRepository.findPendingRequest(userId)) {
        throw new ApiError(400, "Pending admin request already exists.");
    }
    const user = await userRepository.findById(userId);
    return userRepository.createAdminRequest({ userId, email: user.email, reason });
  }

  async reviewAdminRequest(requestId, status) {
    const request = await userRepository.findAdminRequestById(requestId);
    if (!request) throw new ApiError(404, "Request not found");

    request.status = status;
    request.reviewedAt = Date.now();
    await userRepository.saveAdminRequest(request);

    const user = await userRepository.findById(request.userId);
    
    if (status === "approved") {
      user.role = "admin";
      await userRepository.save(user);
      await sendMail(user.email, "Admin Access Approved", "<p>Your admin request was approved.</p>");
    } else {
      await sendMail(user.email, "Admin Access Rejected", "<p>Your admin request was rejected.</p>");
    }
    return user;
  }
}

export default new UserService();