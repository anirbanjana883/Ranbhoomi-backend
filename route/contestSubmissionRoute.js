import express from "express";
import {
  createContestSubmission,
  getContestSubmissionStatus,
  getSubmissionsForProblem 
} from "../controller/contestSubmissionController.js";
import isAuth from "../middleware/isAuth.js";
import { contestRateLimiter } from "../middleware/rateLimiter.js"; 

const router = express.Router();

// Apply Auth middleware globally to this entire router
router.use(isAuth); 

// POST /api/contest-submissions
// Action: Submit code for evaluation
router.post("/", contestRateLimiter, createContestSubmission);

// GET /api/contest-submissions/:submissionId
// Action: Get the status/result of a specific submission (REST Fix)
router.get("/:submissionId", getContestSubmissionStatus); 

// GET /api/contest-submissions/problem/:slug
// Action: Get all contest submissions by the logged-in user for a specific problem
router.get("/problem/:slug", getSubmissionsForProblem); 

export default router;