import express from "express";
import { getAIHelp } from "../controller/aiController.js";
import isAuth from "../middleware/isAuth.js";
import { checkAiLimit } from "../middleware/featureGate.js"; 

const aiRouter = express.Router();


aiRouter.post("/ask", isAuth, checkAiLimit, getAIHelp);

export default aiRouter;