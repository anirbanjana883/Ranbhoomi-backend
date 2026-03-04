import express from "express";
import mongoose from "mongoose";
import {
    createSubmission,
    getSubmissionsForProblem,
    getSubmissionStatus
} from "../controller/submissionController.js";
import isAuth from "../middleware/isAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js"; 

const submissionRouter = express.Router();

// Middleware to prevent Mongoose CastErrors before they hit the DB
const validateObjectId = (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.submissionId)) {
        return res.status(400).json({ success: false, message: "Invalid Submission ID format." });
    }
    next();
};

submissionRouter.use(isAuth); 

// create submission
submissionRouter.post("/", rateLimiter, createSubmission);

// get submiswsion for single problem 
submissionRouter.get("/problem/:slug", getSubmissionsForProblem);

// get submission for dashboard
submissionRouter.get(
    "/status/:submissionId", 
    validateObjectId, 
    getSubmissionStatus
);

export default submissionRouter;