import interviewService from "./interview.service.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";
import { ApiError } from "../../shared/utils/ApiError.js";

export const createInterviewSession = async (req, res) => {
    if (!req.userId) throw new ApiError(401, "Unauthorized");
    res.status(201).json(new ApiResponse(201, await interviewService.createSession(req.userId), "Created"));
};

export const getInterviewSession = async (req, res) => {
    if (!req.params.roomID) throw new ApiError(400, "Room ID required");
    res.status(200).json(new ApiResponse(200, await interviewService.getSessionData(req.params.roomID, req.userId), "Fetched"));
};

export const endInterviewSession = async (req, res) => {
    if (!req.params.roomID) throw new ApiError(400, "Room ID required");
    res.status(200).json(new ApiResponse(200, await interviewService.endSession(req.params.roomID, req.userId), "Completed and archived"));
};