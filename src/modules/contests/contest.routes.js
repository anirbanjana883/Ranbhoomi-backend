import express from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { isAuth, isAdmin, isPremium } from "../../shared/middlewares/auth.middleware.js";
import { verifyCronSecret } from "../../shared/middlewares/cron.middleware.js";
import {
    getAllContests, getRanking, getContestDetails, registerForContest,
    createContest, createPrivateContest, deleteContest, finalizeLeaderboardsCron, publishProblemsCron
} from "./contest.controller.js";

const router = express.Router();

router.post("/cron/finalize-contests", verifyCronSecret, asyncHandler(finalizeLeaderboardsCron));
router.post("/cron/publish-problems", verifyCronSecret, asyncHandler(publishProblemsCron));

router.get("/", asyncHandler(getAllContests));
router.get("/:slug/ranking", asyncHandler(getRanking));

router.get("/:slug", isAuth, asyncHandler(getContestDetails));
router.post("/:slug/register", isAuth, asyncHandler(registerForContest));

router.post("/private", isAuth, isPremium, asyncHandler(createPrivateContest));

router.post("/", isAuth, isAdmin, asyncHandler(createContest));
router.delete("/:slug", isAuth, isAdmin, asyncHandler(deleteContest));

export default router;