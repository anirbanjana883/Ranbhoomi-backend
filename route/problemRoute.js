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
  getProblemForEdit,
  getUnpublishedProblems,
} from "../controller/problemController.js";
import isAuth from "../middleware/isAuth.js";
import isAdmin from "../middleware/isAdmin.js";

const problemRouter = express.Router();

// ==========================================
// 1. ADMIN PROBLEM MANAGEMENT
// Standard REST uses the base URL with different HTTP methods
// ==========================================

// Note: Kept /admin prefix for dashboard-specific heavy reads to separate them from public APIs
problemRouter.get("/admin/all", isAuth, isAdmin, getAllProblemsAdmin);
problemRouter.get("/admin/:slug", isAuth, isAdmin, getProblemForEdit); 
problemRouter.get("/unpublished", isAuth, isAdmin, getUnpublishedProblems);

// ==========================================
// 2. TEST CASE MANAGEMENT (Sub-Resources)
// ==========================================

// GET /api/problems/:slug/testcases (Replaces /:slug/alltestcases)
problemRouter.get("/:slug/testcases", isAuth, isAdmin, getAllTestCasesForProblem);

// POST /api/problems/:slug/testcases
problemRouter.post("/:slug/testcases", isAuth, isAdmin, addTestCaseToProblem);

// DELETE /api/problems/testcases/:testCaseId 
// (REST best practice: if a sub-resource has a unique DB ID, you don't need the parent slug to delete it)
problemRouter.delete("/testcases/:testCaseId", isAuth, isAdmin, deleteTestCaseFromProblem);

// ==========================================
// 3. PUBLIC / USER ROUTES
// Base Route: /api/problems
// ==========================================

// GET /api/problems (Replaces /getallproblem)
problemRouter.get("/", getAllProblems);

// GET /api/problems/:slug/solution (Sub-resource of a specific problem)
problemRouter.get("/:slug/solution", isAuth, getProblemSolution);

// ==========================================
// 4. BASE CRUD ROUTES
// ==========================================

// POST /api/problems (Replaces /createproblem)
problemRouter.post("/", isAuth, isAdmin, createProblem);

// PUT /api/problems/:slug (Replaces /updateproblem/:slug)
problemRouter.patch("/:slug", isAuth, isAdmin, updateProblem);

// DELETE /api/problems/:slug (Replaces /deleteproblem/:slug)
problemRouter.delete("/:slug", isAuth, isAdmin, deleteProblem);

// ==========================================
// 5. PARAM ROUTES (MUST BE LAST)
// ==========================================

// GET /api/problems/:slug (Replaces /getoneproblem/:slug)
problemRouter.get("/:slug", getProblemBySlug);

export default problemRouter;