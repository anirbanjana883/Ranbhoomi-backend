
import express from "express";
import { getAllCompanyTags, getAllProblemTags } from "../controller/tagController.js";

const tagRouter = express.Router();

tagRouter.get("/problems", getAllProblemTags);
tagRouter.get("/companies", getAllCompanyTags);

export default tagRouter;