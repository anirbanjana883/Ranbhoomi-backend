import tagService from "./tag.service.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";

export const getAllProblemTags = async (req, res) => {
    res.status(200).json(new ApiResponse(200, tagService.getProblemTags(), "Problem tags fetched successfully"));
};

export const getAllCompanyTags = async (req, res) => {
    res.status(200).json(new ApiResponse(200, tagService.getCompanyTags(), "Company tags fetched successfully"));
};