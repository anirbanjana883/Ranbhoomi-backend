
import express from "express";
import {
    createSubmission,
    getSubmissionsForProblem,
    getSubmissionStatus
} from "../controller/submissionController.js";
import isAuth from "../middleware/isAuth.js";

const submissionRouter = express.Router();
submissionRouter.use(isAuth); 

submissionRouter.post("/", createSubmission);

submissionRouter.get("/problem/:slug", getSubmissionsForProblem);

submissionRouter.get("/status/:submissionId", getSubmissionStatus);

export default submissionRouter;