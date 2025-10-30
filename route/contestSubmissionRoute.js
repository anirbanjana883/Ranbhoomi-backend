// routes/contestSubmissionRoutes.js
import express from "express";
import isAuth from "../middleware/isAuth.js";
import { createContestSubmission, getContestSubmissionStatus, getSubmissionsForProblem } from "../controller/contestSubmissionController.js";

const contestSubmissionRouter = express.Router();
contestSubmissionRouter.use(isAuth); 

contestSubmissionRouter.post("/", createContestSubmission);

contestSubmissionRouter.get("/status/:submissionId", getContestSubmissionStatus); 

contestSubmissionRouter.get("/problem/:slug", getSubmissionsForProblem); 

export default contestSubmissionRouter;