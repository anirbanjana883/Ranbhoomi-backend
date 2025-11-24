import express from "express";
import { getAIHelp } from "../controller/aiController.js";
import isAuth from "../middleware/isAuth.js";

const aiRouter = express.Router();

aiRouter.post("/ask", isAuth, getAIHelp);

export default aiRouter;