import problemService from "./problem.service.js";
import problemRepository from "./problem.repository.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";

export const getAllProblems = async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(200, await problemService.getPublicProblems(req.query)),
    );
export const getAllProblemsAdmin = async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(200, await problemService.getAdminProblems(req.query)),
    );
export const getProblemBySlug = async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await problemService.getProblemBySlug(req.params.slug),
      ),
    );
export const getProblemForEdit = async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await problemRepository.findForEdit(req.params.slug),
      ),
    );
export const createProblem = async (req, res) =>
  res
    .status(201)
    .json(new ApiResponse(201, await problemService.createProblem(req.body)));
export const updateProblem = async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await problemService.updateProblem(req.params.slug, req.body),
      ),
    );
export const deleteProblem = async (req, res) => {
  await problemService.deleteProblem(req.params.slug);
  res.status(200).json(new ApiResponse(200, null, "Deleted"));
};
export const getAllTestCasesForProblem = async (req, res) => {
  const p = await problemRepository.findOne({ slug: req.params.slug });
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await problemRepository.findTestCasesByProblem(p._id),
      ),
    );
};
export const addTestCaseToProblem = async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await problemService.addTestCase(req.params.slug, req.body),
      ),
    );
export const deleteTestCaseFromProblem = async (req, res) => {
  await problemService.deleteTestCase(req.params.testCaseId);
  res.status(200).json(new ApiResponse(200, null, "Deleted"));
};
export const getProblemSolution = async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(200, {
        solution: await problemService.getSolution(
          req.params.slug,
          req.userId,
          req.userRole === "admin" || req.userRole === "master",
        ),
      }),
    );
export const getUnpublishedProblems = async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await problemRepository.findProblems(
          { isPublished: false, isDeleted: { $ne: true } },
          0,
          1000,
          {},
          "_id title slug difficulty score",
        ),
      ),
    );
