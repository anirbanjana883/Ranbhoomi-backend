import express from "express";
import { finalizeEndedContests, publishEndedContestProblems } from "../controllers/contestAdminController.js";
import { verifyCronSecret } from "../middlewares/cronAuth.js";

const router = express.Router();

// Apply the security middleware to all cron routes
router.use(verifyCronSecret);

router.post("/finalize-contests", finalizeEndedContests);
router.post("/publish-problems", publishEndedContestProblems);

export default router;