import express from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { isAuth } from "../../shared/middlewares/auth.middleware.js";
import { checkAiLimit } from "../../shared/middlewares/featureGate.middleware.js";
import { getAIHelp } from "./ai.controller.js";

const router = express.Router();

router.post("/ask", isAuth, checkAiLimit, asyncHandler(getAIHelp));

export default router;