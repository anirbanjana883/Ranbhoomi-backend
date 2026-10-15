import express from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { isAuth, isAdmin } from "../../shared/middlewares/auth.middleware.js";
import {
  getAllProblems, getProblemBySlug, createProblem, updateProblem, deleteProblem,
  addTestCaseToProblem, deleteTestCaseFromProblem, getAllTestCasesForProblem,
  getAllProblemsAdmin, getProblemForEdit, getProblemSolution, getUnpublishedProblems
} from "./problem.controller.js";

const router = express.Router();

router.get("/admin/all", isAuth, isAdmin, asyncHandler(getAllProblemsAdmin));
router.get("/admin/:slug", isAuth, isAdmin, asyncHandler(getProblemForEdit));
router.get("/unpublished", isAuth, isAdmin, asyncHandler(getUnpublishedProblems));
router.get("/:slug/testcases", isAuth, isAdmin, asyncHandler(getAllTestCasesForProblem));
router.post("/:slug/testcases", isAuth, isAdmin, asyncHandler(addTestCaseToProblem));
router.delete("/testcases/:testCaseId", isAuth, isAdmin, asyncHandler(deleteTestCaseFromProblem));

router.get("/", asyncHandler(getAllProblems));
router.get("/:slug/solution", isAuth, asyncHandler(getProblemSolution));
router.post("/", isAuth, isAdmin, asyncHandler(createProblem));
router.patch("/:slug", isAuth, isAdmin, asyncHandler(updateProblem));
router.delete("/:slug", isAuth, isAdmin, asyncHandler(deleteProblem));
router.get("/:slug", asyncHandler(getProblemBySlug));

export default router;