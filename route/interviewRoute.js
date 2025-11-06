import express from "express";
import { createInterviewSession, getInterviewSession } from "../controller/interviewController.js";
import isAuth from "../middleware/isAuth.js";

const interviewRouter = express.Router();

interviewRouter.post("/create", isAuth, createInterviewSession);
interviewRouter.get("/session/:roomID", isAuth, getInterviewSession);

export default interviewRouter;