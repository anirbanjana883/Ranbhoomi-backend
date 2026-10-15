import express from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { isAuth } from "../../shared/middlewares/auth.middleware.js";
import { rateLimiter, contestRateLimiter } from "../../shared/middlewares/rateLimiter.middleware.js";
import {
    createPracticeSubmission, createContestSubmission, getPracticeStatus, getPracticeHistory, getContestHistory
} from "./codeexecution.controller.js";

const router = express.Router();
router.use(isAuth);

const validateId = (req, res, next) => mongoose.Types.ObjectId.isValid(req.params.submissionId) ? next() : res.status(400).json({ success: false, message: "Invalid ID" });

router.post("/practice", rateLimiter, asyncHandler(createPracticeSubmission));
router.get("/practice/status/:submissionId", validateId, asyncHandler(getPracticeStatus));
router.get("/practice/problem/:slug", asyncHandler(getPracticeHistory));

router.post("/contest", contestRateLimiter, asyncHandler(createContestSubmission));
router.get("/contest/problem/:slug", asyncHandler(getContestHistory));

export default router;