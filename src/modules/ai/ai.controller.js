import aiService from "./ai.service.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";

export const getAIHelp = async (req, res) => {
    const data = await aiService.getHelp(req.body, req.userFull, req.planLimit);
    res.status(200).json(new ApiResponse(200, data, "AI response generated"));
};