import express from "express";
import {
    getAllProblems,
    getProblemBySlug,
    createProblem,
    updateProblem, 
    deleteProblem,
    addTestCaseToProblem,      
    deleteTestCaseFromProblem,
    getAllTestCasesForProblem,
    getProblemSolution,
    getAllProblemsAdmin, 
} from "../controller/problemController.js";
import isAuth from "../middleware/isAuth.js";
import isAdmin from "../middleware/isAdmin.js"; 

const problemRouter = express.Router();


problemRouter.get("/getallproblem", getAllProblems); // for all user 
problemRouter.get("/getoneproblem/:slug", getProblemBySlug);

// get all problem for admin only 
problemRouter.get("/admin/all", isAuth, isAdmin, getAllProblemsAdmin);

problemRouter.post("/createproblem", isAuth, isAdmin, createProblem);
problemRouter.put("/updateproblem/:slug", isAuth, isAdmin, updateProblem); 
problemRouter.delete("/deleteproblem/:slug", isAuth, isAdmin, deleteProblem);


problemRouter.get("/:slug/alltestcases", isAuth, isAdmin, getAllTestCasesForProblem);
problemRouter.post("/:slug/testcases", isAuth, isAdmin, addTestCaseToProblem);
problemRouter.delete("/testcases/:testCaseId", isAuth, isAdmin, deleteTestCaseFromProblem);


problemRouter.get("/getoneproblem/:slug/solution", isAuth, getProblemSolution);


export default problemRouter;