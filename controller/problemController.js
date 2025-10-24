import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js"; 
import { ALLOWED_PROBLEM_TAGS } from "../config/problemTags.js";
import { ALLOWED_COMPANY_TAGS } from "../config/companyTags.js";

// --- GET ALL PROBLEMS  ---
export const getAllProblems = async (req, res) => {
    try {
        
        const { difficulty, tags, company, search } = req.query;
        const filter = {};

        if (difficulty && ["Easy", "Medium", "Hard" , "Super Hard"].includes(difficulty)) {
            filter.difficulty = difficulty;
        }

        
        if (tags) {
            const tagsArray = tags.split(',').map(tag => tag.trim().toLowerCase());
            
            filter.tags = { $all: tagsArray };
        }

        
        if (company) {
            filter.companyTags = company.trim().toLowerCase(); 
        }

        
        if (search) {
            filter.title = { $regex: search, $options: 'i' }; 
        }
        

        
        const problems = await Problem.find(filter) 
                                      .select("title slug difficulty tags companyTags createdAt") 
                                      .sort({ createdAt: -1 }); 

        return res.status(200).json(problems);
    } catch (error) {
        console.error("Error fetching problems:", error);
        return res.status(500).json({ message: `Error fetching problems: ${error.message}` });
    }
};

// --- GET SINGLE PROBLEM  ---
export const getProblemBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        
        const problem = await Problem.findOne({ slug: slug })
                                     .populate({
                                         path: 'testCases', 
                                         match: { isSample: true }, 
                                         select: 'input expectedOutput _id' 
                                     })
                                     .select("-solution"); 

        if (!problem) {
            return res.status(404).json({ message: "Problem not found" });
        }

        

        return res.status(200).json(problem);
    } catch (error) {
        console.error("Error fetching problem by slug:", error); 
        return res.status(500).json({ message: `Error fetching problem: ${error.message}` });
    }
};


// --- Placeholder functions for Admin/Master actions (implement later) ---

// CREATE PROBLEM (Admin/Master Only)
export const createProblem = async (req, res) => {
    const { title, slug, description, difficulty, tags, starterCode, testCasesData } = req.body;

    // --- 2. Validate Tags ---
    if (tags && Array.isArray(tags)) {
        // Convert all incoming tags to lowercase for case-insensitive check
        const lowerCaseTags = tags.map(tag => tag.toLowerCase().trim());
        const invalidTags = lowerCaseTags.filter(tag => !ALLOWED_PROBLEM_TAGS.includes(tag));

        if (invalidTags.length > 0) {
            return res.status(400).json({ message: `Invalid tags found: ${invalidTags.join(', ')}` });
        }
        // Use the cleaned lowerCaseTags when creating the problem
        req.body.tags = lowerCaseTags;
    } else if (tags) {
         return res.status(400).json({ message: `Tags must be provided as an array.` });
    }
    // --- End Validation ---

    try {
        // --- Placeholder ---
        console.log("Validation passed (Tags):", req.body.tags);
        // TODO: Implement actual logic to create Problem and TestCases
        // Example:
        // const newProblem = new Problem({ title, slug, description, difficulty, tags: req.body.tags, starterCode });
        // // ... create TestCases from testCasesData, link them to newProblem ...
        // await newProblem.save();
        // ...
        return res.status(501).json({ message: "Create problem endpoint not fully implemented yet." });
        // --- End Placeholder ---

    } catch (error) {
       console.error("Error creating problem:", error);
       // Handle potential duplicate key errors for title/slug
       if (error.code === 11000) {
           const field = Object.keys(error.keyValue)[0];
           return res.status(400).json({ message: `A problem with this ${field} already exists.` });
       }
       return res.status(500).json({ message: `Error creating problem: ${error.message}` });
    }
};

// UPDATE PROBLEM (Admin/Master Only)
export const updateProblem = async (req, res) => {
    // Logic to update problem details and potentially add/remove/edit test cases
    // Needs 'isMaster' or 'isAdmin' middleware in the route
     return res.status(501).json({ message: "Update problem endpoint not implemented yet." });
};

// DELETE PROBLEM (Admin/Master Only)
export const deleteProblem = async (req, res) => {
    // Logic to delete a problem AND its associated test cases
    // Needs 'isMaster' or 'isAdmin' middleware in the route
     return res.status(501).json({ message: "Delete problem endpoint not implemented yet." });
};