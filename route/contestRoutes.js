import express from "express";
import {
    calculateRanking,
    createContest,
    createPrivateContest,
    deleteContest,
    getAllContests,
    getContestDetails, 
    getRanking, 
    registerForContest,
    updateContest,
    updatePrivateContest, 
} from "../controller/contestController.js"; 
import isAuth from "../middleware/isAuth.js";
import isAdmin from "../middleware/isAdmin.js"; 
import isPremium from "../middleware/isPremium.js";

const router = express.Router();

// ==========================================
// 1. PUBLIC ROUTES (No Auth Required)
// ==========================================
router.get("/", getAllContests);
router.get("/:slug/ranking", getRanking); // Leaderboard is public

// ==========================================
// 2. STANDARD USER ROUTES (Auth Required)
// ==========================================
router.get("/:slug", isAuth, getContestDetails); 
router.post("/:slug/register", isAuth, registerForContest);

// ==========================================
// 3. PREMIUM USER ROUTES (Auth + Premium)
// ==========================================
router.post("/private", isAuth, isPremium, createPrivateContest);
router.put("/private/:slug", isAuth, isPremium, updatePrivateContest);

// ==========================================
// 4. ADMIN / MASTER ROUTES (Auth + Admin)
// ==========================================
router.post("/", isAuth, isAdmin, createContest);
router.put("/:slug", isAuth, isAdmin, updateContest);
router.delete("/:slug", isAuth, isAdmin, deleteContest);
router.post("/:slug/calculate", isAuth, isAdmin, calculateRanking); 

export default router;