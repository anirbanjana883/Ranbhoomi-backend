import Problem from "./problem.model.js";
import TestCase from "./testCase.model.js";

class ProblemRepository {
  async findProblems(filter, skip, limit, sortObj, selectStr) {
    return Problem.find(filter)
      .select(selectStr)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();
  }
  async findBySlug(slug, populateTestCases = false) {
    let query = Problem.findOne({ slug, isDeleted: { $ne: true } });
    if (populateTestCases)
      query = query
        .populate({
          path: "testCases",
          match: { isSample: true },
          select: "input expectedOutput _id",
        })
        .select("-solution -driverCode");
    return query.lean();
  }
  async findForEdit(slug) {
    return Problem.findOne({ slug, isDeleted: { $ne: true } })
      .populate({
        path: "testCases",
        select: "input expectedOutput isSample createdAt",
      })
      .lean();
  }
  async findOne(filter, session = null) {
    return Problem.findOne(filter).session(session);
  }
  async findById(id) {
    return Problem.findById(id).lean();
  }
  async createProblem(data, session) {
    const problem = new Problem(data);
    await problem.save({ session });
    return problem;
  }
  async createTestCases(dataArray, session) {
    return TestCase.insertMany(dataArray, { session });
  }
  async softDelete(slug) {
    return Problem.findOneAndUpdate(
      { slug },
      { isDeleted: true },
      { new: true },
    );
  }
  async findTestCasesByProblem(problemId) {
    return TestCase.find({ problem: problemId })
      .select("input expectedOutput isSample createdAt")
      .sort({ createdAt: 1 })
      .lean();
  }
  async createSingleTestCase(data) {
    const tc = new TestCase(data);
    await tc.save();
    return tc;
  }
  async addTestCaseToProblemUnsafe(problemId, testCaseId, maxTestCases) {
    return Problem.findOneAndUpdate(
      {
        _id: problemId,
        $expr: { $lt: [{ $size: "$testCases" }, maxTestCases] },
      },
      { $addToSet: { testCases: testCaseId } },
      { new: true },
    );
  }
  async deleteTestCaseDirect(id, session = null) {
    return TestCase.findByIdAndDelete(id).session(session);
  }
  async pullTestCaseFromProblem(testCaseId, session) {
    return Problem.findOneAndUpdate(
      { testCases: testCaseId },
      { $pull: { testCases: testCaseId }, $set: { updatedAt: new Date() } },
      { session, new: true },
    );
  }
}

export default new ProblemRepository();
