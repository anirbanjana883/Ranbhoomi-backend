import express from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { isAuth } from "../../shared/middlewares/auth.middleware.js";
import { createInterviewSession, getInterviewSession, endInterviewSession } from "./interview.controller.js";

const router = express.Router();

router.post("/", isAuth, asyncHandler(createInterviewSession));
router.get("/:roomID", isAuth, asyncHandler(getInterviewSession));
router.patch("/:roomID/end", isAuth, asyncHandler(endInterviewSession));

export default router;