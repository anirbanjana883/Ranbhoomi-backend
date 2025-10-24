import express from "express";
import {
    getAllProblems,
    getProblemBySlug,
    createProblem,
    updateProblem,
    deleteProblem,
} from "../controller/problemController.js";
import isAuth from "../middleware/isAuth.js"; 
import isAdmin from "../middleware/isAdmin.js"; 

const problemRouter = express.Router();

// --- Public Routes ---

problemRouter.get("/getallproblem", getAllProblems);

problemRouter.get("/getoneproblem/:slug", getProblemBySlug);

// --- Protected Routes (Admin or Master Only) ---

problemRouter.post("/createproblem", isAuth, isAdmin, createProblem);

problemRouter.put("/updateproblem/:slug", isAuth, isAdmin, updateProblem);

problemRouter.delete("/deleteproblem/:slug", isAuth, isAdmin, deleteProblem);


export default problemRouter;