import express from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { getAllProblemTags, getAllCompanyTags } from "./tag.controller.js";

const router = express.Router();

router.get("/problems", asyncHandler(getAllProblemTags));
router.get("/companies", asyncHandler(getAllCompanyTags));

export default router;