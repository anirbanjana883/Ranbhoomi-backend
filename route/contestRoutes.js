import express from "express";
import {
    calculateRanking,
    createContest,
    deleteContest,
    getAllContests,
    getContestDetails, 
    getRanking, 
    registerForContest,
    updateContest, 
} from "../controller/contestController.js"; 
import isAuth from "../middleware/isAuth.js";
import isAdmin from "../middleware/isAdmin.js"; 

const contestRouter = express.Router();

// --- Public Route ---

contestRouter.get("/", getAllContests);

// --- Admin/Master Only Route ---

contestRouter.post("/", isAuth, isAdmin, createContest);

contestRouter.put("/:slug", isAuth, isAdmin, updateContest);

contestRouter.delete("/:slug", isAuth, isAdmin, deleteContest);

contestRouter.post("/:slug/calculate", isAuth, isAdmin, calculateRanking); 

contestRouter.get("/:slug/ranking", getRanking);

// --- User Routes  ---

contestRouter.get("/:slug", isAuth, getContestDetails);

contestRouter.post("/:slug/register", isAuth, registerForContest);

export default contestRouter;