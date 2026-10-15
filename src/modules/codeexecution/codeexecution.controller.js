import executionService from "./codeexecution.service.js";
import Submission from "./submission.model.js";
import ContestSubmission from "./contestSubmission.model.js";
import Problem from "../problems/problem.model.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";
import { ApiError } from "../../shared/utils/ApiError.js";

export const createPracticeSubmission = async (req, res) => res.status(201).json(new ApiResponse(201, await executionService.createPracticeSubmission(req.body, req.userId), "Queued"));
export const createContestSubmission = async (req, res) => res.status(201).json(new ApiResponse(201, await executionService.createContestSubmission(req.body, req.userId), "Queued"));

export const getPracticeStatus = async (req, res) => {
    const sub = await Submission.findOne({ _id: req.params.submissionId, user: req.userId }).select("-code -judge0Tokens").lean();
    if (!sub) throw new ApiError(404, "Not found");
    res.status(200).json(new ApiResponse(200, sub));
};

export const getPracticeHistory = async (req, res) => {
    const p = await Problem.findOne({ slug: req.params.slug, isDeleted: { $ne: true } }).select("_id").lean();
    if (!p) throw new ApiError(404, "Not found");
    res.status(200).json(new ApiResponse(200, await Submission.find({ problem: p._id, user: req.userId }).select("status language createdAt score executionTime memoryUsed").sort({ createdAt: -1 }).limit(50).lean()));
};

export const getContestHistory = async (req, res) => {
    const p = await Problem.findOne({ slug: req.params.slug, isDeleted: { $ne: true } }).select("_id").lean();
    if (!p) throw new ApiError(404, "Not found");
    res.status(200).json(new ApiResponse(200, await ContestSubmission.find({ problem: p._id, user: req.userId }).select("status language score createdAt executionTime memoryUsed").sort({ createdAt: -1 }).limit(50).lean()));
};