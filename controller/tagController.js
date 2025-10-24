
import { ALLOWED_PROBLEM_TAGS } from "../config/problemTags.js";
import { ALLOWED_COMPANY_TAGS } from "../config/companyTags.js"; 


export const getAllProblemTags = (req, res) => {
    try {
        res.status(200).json([...ALLOWED_PROBLEM_TAGS].sort());
    } catch (error) {
        console.error("Error fetching problem tags:", error);
        res.status(500).json({ message: "Failed to load problem tags." });
    }
};

export const getAllCompanyTags = (req, res) => {
    try {

        res.status(200).json([...ALLOWED_COMPANY_TAGS].sort()); 
    } catch (error) {
        console.error("Error fetching company tags:", error);
        res.status(500).json({ message: "Failed to load company tags." });
    }
};
