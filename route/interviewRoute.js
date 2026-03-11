import express from "express";
import { 
    createInterviewSession, 
    getInterviewSession,
    endInterviewSession 
} from "../controller/interviewController.js";
import isAuth from "../middleware/isAuth.js";

const interviewRouter = express.Router();

interviewRouter.post("/", isAuth, createInterviewSession);
interviewRouter.get("/:roomID", isAuth, getInterviewSession);
interviewRouter.patch("/:roomID/end", isAuth, endInterviewSession);

export default interviewRouter;