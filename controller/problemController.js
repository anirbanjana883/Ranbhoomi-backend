import mongoose from "mongoose";
import Problem from "../models/problemModel.js";
import TestCase from "../models/testCaseModel.js";
import Submission from "../models/submissionModel.js";
import User from "../models/userModel.js";

import {
  ALLOWED_PROBLEM_TAGS,
  normalizeProblemTag,
} from "../config/problemTags.js";
import {
  ALLOWED_COMPANY_TAGS,
  normalizeCompanyTag,
} from "../config/companyTags.js";

// --- GET ALL PROBLEMS (with filtering) ---
export const getAllProblems = async (req, res) => {
  try {
    const { difficulty, tags, company, search } = req.query;
    const filter = {
      isPublished: true,
    };

    if (
      difficulty &&
      ["Easy", "Medium", "Hard", "Super Hard"].includes(difficulty)
    ) {
      filter.difficulty = difficulty;
    }
    if (tags) {
      const tagsArray = tags.split(",").map((tag) => tag.trim().toLowerCase());
      filter.tags = { $all: tagsArray };
    }
    if (company) {
      filter.companyTags = company.trim().toLowerCase();
    }
    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const problems = await Problem.find(filter)
      .select("title slug difficulty tags companyTags createdAt isPremium")
      .sort({ createdAt: -1 });

    return res.status(200).json(problems);
  } catch (error) {
    console.error("Error fetching problems:", error);
    return res
      .status(500)
      .json({ message: `Error fetching problems: ${error.message}` });
  }
};

// --- GET ALL PROBLEMS (with filtering) for admin only ---
export const getAllProblemsAdmin = async (req, res) => {
  try {
    const { difficulty, tags, company, search } = req.query;

    const filter = {}; 

    if (difficulty && ["Easy", "Medium", "Hard", "Super Hard"].includes(difficulty)) {
      filter.difficulty = difficulty;
    }
    if (tags) {
      const tagsArray = tags.split(",").map((tag) => tag.trim().toLowerCase());
      filter.tags = { $all: tagsArray };
    }
    if (company) {
      filter.companyTags = company.trim().toLowerCase();
    }
    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const problems = await Problem.find(filter)
      // --- SELECT "isPublished" FOR THE TABLE ---
      .select("title slug difficulty tags companyTags createdAt isPremium isPublished")
      .sort({ createdAt: -1 });

    return res.status(200).json(problems);
  } catch (error) {
    console.error("Error fetching admin problems:", error);
    return res
      .status(500)
      .json({ message: `Error fetching admin problems: ${error.message}` });
  }
};

// --- GET SINGLE PROBLEM (includes SAMPLE test cases) ---
export const getProblemBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const problem = await Problem.findOne({ slug: slug })
      .populate({
        path: "testCases",
        match: { isSample: true },
        select: "input expectedOutput _id",
      })
      .select("-solution"); // Exclude solution by default

    if (!problem) {
      return res.status(404).json({ message: "Problem not found" });
    }
    return res.status(200).json(problem);
  } catch (error) {
    console.error("Error fetching problem by slug:", error);
    return res
      .status(500)
      .json({ message: `Error fetching problem: ${error.message}` });
  }
};

// --- CREATE PROBLEM (Admin/Master Only) ---
export const createProblem = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      title,
      description,
      difficulty,
      tags,
      companyTags,
      starterCode,
      testCasesData,
      solution,
      isPremium,
      isPublished,
      originContest,
    } = req.body;

    // Basic Validation
    if (
      !title ||
      !description ||
      !difficulty ||
      !testCasesData ||
      !Array.isArray(testCasesData) ||
      testCasesData.length === 0 ||
      !starterCode ||
      !Array.isArray(starterCode) ||
      starterCode.length === 0
    ) {
      throw new Error(
        "Missing required fields: title, description, difficulty, starterCode, and at least one test case."
      );
    }

    // Generate Slug
    const generatedSlug = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "");

    // Validate & Normalize Tags
    let validatedTags = [];
    if (tags && Array.isArray(tags)) {
      validatedTags = tags
        .map((tag) => normalizeProblemTag(tag))
        .filter((tag) => tag !== null);
      const invalidTags = validatedTags.filter(
        (tag) => !ALLOWED_PROBLEM_TAGS.includes(tag)
      );
      if (invalidTags.length > 0)
        throw new Error(`Invalid problem tags: ${invalidTags.join(", ")}`);
    } else if (tags) throw new Error(`Problem tags must be an array.`);

    // Validate & Normalize Company Tags
    let validatedCompanyTags = [];
    if (companyTags && Array.isArray(companyTags)) {
      validatedCompanyTags = companyTags
        .map((tag) => normalizeCompanyTag(tag))
        .filter((tag) => tag !== null);
      const invalidCompanies = validatedCompanyTags.filter(
        (tag) => !ALLOWED_COMPANY_TAGS.includes(tag)
      );
      if (invalidCompanies.length > 0)
        throw new Error(`Invalid company tags: ${invalidCompanies.join(", ")}`);
    } else if (companyTags) throw new Error(`Company tags must be an array.`);

    // Check Duplicates
    const existingProblem = await Problem.findOne({
      $or: [{ title }, { slug: generatedSlug }],
    }).session(session);
    if (existingProblem) {
      const field = existingProblem.title === title ? "title" : "slug";
      throw new Error(`A problem with this ${field} already exists.`);
    }

    // Create Problem Doc
    const newProblem = new Problem({
      title,
      slug: generatedSlug,
      description,
      difficulty,
      tags: validatedTags,
      companyTags: validatedCompanyTags,
      starterCode,
      solution: solution || "",
      isPremium: isPremium || false,
      testCases: [],
      isPublished: isPublished,
      originContest: originContest || null,
    });
    await newProblem.save({ session });

    // Create TestCase Docs
    const testCaseDocsData = testCasesData.map((tc) => ({
      problem: newProblem._id,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      isSample: tc.isSample || false,
    }));
    const createdTestCases = await TestCase.insertMany(testCaseDocsData, {
      session,
    });

    // Link TestCases back to Problem
    newProblem.testCases = createdTestCases.map((tc) => tc._id);
    await newProblem.save({ session });

    if (originContest && isPublished === false) {
      await Contest.findByIdAndUpdate(
        originContest,
        { $push: { problems: { problem: newProblem._id } } },
        { session }
      );
    }

    // Commit Transaction
    await session.commitTransaction();

    // Populate response
    await newProblem.populate({
      path: "testCases",
      match: { isSample: true },
      select: "input expectedOutput _id",
    });
    return res.status(201).json(newProblem);
  } catch (error) {
    await session.abortTransaction();
    console.error("Error creating problem:", error);
    // Handle specific errors like validation or duplicates nicely
    if (
      error.message.includes("Invalid") ||
      error.message.includes("Missing") ||
      error.message.includes("already exists")
    ) {
      return res.status(400).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: `Error creating problem: ${error.message}` });
  } finally {
    session.endSession();
  }
};

// --- UPDATE PROBLEM DETAILS (Admin/Master Only) ---

export const updateProblem = async (req, res) => {
  const { slug } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      title,
      description,
      difficulty,
      tags,
      companyTags,
      starterCode,
      solution,
      isPremium,
      isPublished
    } = req.body;
    const problem = await Problem.findOne({ slug: slug }).session(session);
    if (!problem) throw new Error("Problem not found with this slug.");

    // Handle Title/Slug Change
    let newSlug = problem.slug;
    if (title && title !== problem.title) {
      newSlug = title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "");
      const existing = await Problem.findOne({
        slug: newSlug,
        _id: { $ne: problem._id },
      }).session(session);
      if (existing)
        throw new Error(`Another problem exists with slug '${newSlug}'.`);
      problem.title = title;
      problem.slug = newSlug;
    }

    // Validate & Normalize Tags
    if (tags !== undefined) {
      if (!Array.isArray(tags))
        throw new Error(`Problem tags must be an array.`);
      const validatedTags = tags
        .map((tag) => normalizeProblemTag(tag))
        .filter((tag) => tag !== null);
      const invalidTags = validatedTags.filter(
        (tag) => !ALLOWED_PROBLEM_TAGS.includes(tag)
      );
      if (invalidTags.length > 0)
        throw new Error(`Invalid problem tags: ${invalidTags.join(", ")}`);
      problem.tags = validatedTags;
    }

    // Validate & Normalize Company Tags
    if (companyTags !== undefined) {
      if (!Array.isArray(companyTags))
        throw new Error(`Company tags must be an array.`);
      const validatedCompanyTags = companyTags
        .map((tag) => normalizeCompanyTag(tag))
        .filter((tag) => tag !== null);
      const invalidCompanies = validatedCompanyTags.filter(
        (tag) => !ALLOWED_COMPANY_TAGS.includes(tag)
      );
      if (invalidCompanies.length > 0)
        throw new Error(`Invalid company tags: ${invalidCompanies.join(", ")}`);
      problem.companyTags = validatedCompanyTags;
    }

    // Update other fields
    if (description !== undefined) problem.description = description;
    if (difficulty !== undefined) problem.difficulty = difficulty;
    if (starterCode !== undefined) problem.starterCode = starterCode;
    if (solution !== undefined) problem.solution = solution;
    if (isPremium !== undefined) {
      problem.isPremium = Boolean(isPremium);
    }
    if (isPublished !== undefined) {
      problem.isPublished = Boolean(isPublished); 
    }

    await problem.save({ session });
    await session.commitTransaction();

    // Populate response (optional, based on needs)
    await problem.populate({
      path: "testCases",
      match: { isSample: true },
      select: "input expectedOutput _id",
    });
    return res.status(200).json(problem);
  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating problem:", error);
    if (
      error.message.includes("Invalid") ||
      error.message.includes("not found") ||
      error.message.includes("exists")
    ) {
      return res.status(400).json({ message: error.message }); // Use 404 if "not found"
    }
    return res
      .status(500)
      .json({ message: `Error updating problem: ${error.message}` });
  } finally {
    session.endSession();
  }
};

// --- DELETE PROBLEM (Admin/Master Only) ---
export const deleteProblem = async (req, res) => {
  const { slug } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const problem = await Problem.findOneAndDelete({ slug: slug }).session(
      session
    );
    if (!problem) {
      // Commit and return 404 if not found
      await session.commitTransaction();
      session.endSession();
      return res.status(404).json({ message: "Problem not found." });
    }

    // Delete associated Test Cases
    await TestCase.deleteMany({ problem: problem._id }).session(session);

    //  Delete associated Submissions
    await Submission.deleteMany({ problem: problem._id }).session(session);

    await session.commitTransaction();
    session.endSession();
    return res
      .status(200)
      .json({ message: "Problem and associated data deleted successfully." });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting problem:", error);
    return res
      .status(500)
      .json({ message: `Error deleting problem: ${error.message}` });
  }
};

// get all testcase for a perticular problem
export const getAllTestCasesForProblem = async (req, res) => {
  const { slug } = req.params;
  try {
    // Find the problem first to get its ID
    const problem = await Problem.findOne({ slug }).select("_id");
    if (!problem) {
      return res.status(404).json({ message: "Problem not found." });
    }

    const testCases = await TestCase.find({ problem: problem._id })
      .select("input expectedOutput isSample createdAt")
      .sort({ createdAt: 1 });

    return res.status(200).json(testCases);
  } catch (error) {
    console.error("Error fetching all test cases for problem:", error);
    return res
      .status(500)
      .json({ message: `Error fetching test cases: ${error.message}` });
  }
};

// --- ADD TEST CASE TO PROBLEM (Admin/Master Only) ---
export const addTestCaseToProblem = async (req, res) => {
  const { slug } = req.params;
  const { input, expectedOutput, isSample } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!input || expectedOutput === undefined) {
      // Allow empty expected output
      throw new Error("Input and Expected Output are required.");
    }

    const problem = await Problem.findOne({ slug }).session(session);
    if (!problem) throw new Error("Problem not found.");

    const newTestCase = new TestCase({
      problem: problem._id,
      input,
      expectedOutput,
      isSample: isSample || false,
    });
    await newTestCase.save({ session });

    // Add to problem's array
    await Problem.updateOne(
      { _id: problem._id },
      { $push: { testCases: newTestCase._id } }
    ).session(session);

    await session.commitTransaction();
    session.endSession();
    return res.status(201).json(newTestCase);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error adding test case:", error);
    if (
      error.message.includes("required") ||
      error.message.includes("not found")
    ) {
      return res.status(400).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: `Error adding test case: ${error.message}` });
  }
};

// --- DELETE TEST CASE FROM PROBLEM (Admin/Master Only) ---
export const deleteTestCaseFromProblem = async (req, res) => {
  const { testCaseId } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const testCase = await TestCase.findByIdAndDelete(testCaseId).session(
      session
    );
    if (!testCase) {
      await session.commitTransaction();
      session.endSession();
      return res.status(404).json({ message: "Test case not found." });
    }

    // Remove from the Problem's array
    await Problem.updateOne(
      { _id: testCase.problem },
      { $pull: { testCases: testCaseId } }
    ).session(session);

    await session.commitTransaction();
    session.endSession();
    return res.status(200).json({ message: "Test case deleted successfully." });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting test case:", error);
    return res
      .status(500)
      .json({ message: `Error deleting test case: ${error.message}` });
  }
};

// --- GET PROBLEM SOLUTION ---------
export const getProblemSolution = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.userId; // from isAuth

    // 1. Find the user and problem
    const user = await User.findById(userId).select("role");
    if (!user) return res.status(401).json({ message: "User not found." });

    const problem = await Problem.findOne({ slug }).select("_id solution");
    if (!problem)
      return res.status(404).json({ message: "Problem not found." });

    // 2. Check for Admin/Master role
    if (user.role === "admin" || user.role === "master") {
      return res.status(200).json({ solution: problem.solution });
    }

    // 3. Check if user has an 'Accepted' submission for this problem
    const acceptedSubmission = await Submission.findOne({
      problem: problem._id,
      user: userId,
      status: "Accepted",
    });

    if (acceptedSubmission) {
      return res.status(200).json({ solution: problem.solution });
    }

    // 4. (Future Check) Check for premium subscription
    // if (user.isPremium) {
    //     return res.status(200).json({ solution: problem.solution });
    // }

    // 5. If none of the above, deny access
    return res
      .status(403)
      .json({
        message:
          "You must successfully solve this problem to view the solution.",
      });
  } catch (error) {
    console.error("Error fetching solution:", error);
    return res
      .status(500)
      .json({ message: `Error fetching solution: ${error.message}` });
  }
};
