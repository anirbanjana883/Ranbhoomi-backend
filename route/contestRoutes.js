import express from "express";
import {
    createContest,
    deleteContest,
    getAllContests,
    getContestDetails, 
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

// --- User Routes  ---

contestRouter.get("/:slug", isAuth, getContestDetails);

contestRouter.post("/:slug/register", isAuth, registerForContest);

export default contestRouter;