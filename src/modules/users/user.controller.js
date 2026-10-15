import userService from "./user.service.js";
import userRepository from "./user.repository.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";
import { ApiError } from "../../shared/utils/ApiError.js";

export const getCurrentUser = async (req, res) => {
  const user = await userRepository.findByIdWithoutPassword(req.userId);
  res.status(200).json(new ApiResponse(200, user));
};

export const updateProfile = async (req, res) => {
  const user = await userService.updateProfile(req.userId, req.body, req.file);
  res.status(200).json(new ApiResponse(200, user, "Profile updated"));
};

export const getUserProfile = async (req, res) => {
  const data = await userService.getUserProfileData(
    req.params.username || req.userId, 
    !!req.params.username
  );
  res.status(200).json(new ApiResponse(200, data));
};

export const requestAdmin = async (req, res) => {
  const request = await userService.requestAdminAccess(req.userId, req.body.reason);
  res.status(201).json(new ApiResponse(201, request, "Admin request submitted"));
};

export const listPendingRequests = async (req, res) => {
  const requests = await userRepository.getAllPendingRequests();
  res.status(200).json(new ApiResponse(200, requests));
};

export const approveRequest = async (req, res) => {
  await userService.reviewAdminRequest(req.params.requestId, "approved");
  res.status(200).json(new ApiResponse(200, null, "Request approved"));
};

export const rejectRequest = async (req, res) => {
  await userService.reviewAdminRequest(req.params.requestId, "rejected");
  res.status(200).json(new ApiResponse(200, null, "Request rejected"));
};

export const getAllUsers = async (req, res) => {
  const users = await userRepository.getAllUsers(req.userId);
  res.status(200).json(new ApiResponse(200, users));
};

export const updateUserRole = async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  if (!["user", "admin"].includes(role)) throw new ApiError(400, "Invalid role");
  if (userId === req.userId) throw new ApiError(400, "Cannot change own role");
  
  const user = await userRepository.findById(userId);
  if (user.role === "master") throw new ApiError(403, "Cannot modify master account");
  
  user.role = role;
  await userRepository.save(user);
  res.status(200).json(new ApiResponse(200, await userRepository.findByIdWithoutPassword(userId), `Role updated to ${role}`));
};