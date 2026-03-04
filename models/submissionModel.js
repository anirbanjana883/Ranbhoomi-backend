// models/submissionModel.js
import mongoose from "mongoose";

const testResultSchema = new mongoose.Schema(
  {
    testCase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestCase",
      required: true,
    },
    status: {
      type: String,
      enum: ["Passed", "Failed", "Error", "Judging"],
      required: true,
    },
    time: { type: Number, default: 0 },
    memory: { type: Number, default: 0 },
    output: { type: String, default: "", maxLength: [5000, "Truncated"] },
  },
  { _id: false },
);

const submissionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
    },
    code: { type: String, required: true },
    language: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: [
        "Queued",
        "Pending",
        "Judging",
        "Accepted",
        "Wrong Answer",
        "Time Limit Exceeded",
        "Runtime Error",
        "Compilation Error",
        "Memory Limit Exceeded",
        "Internal Error",
      ],
      default: "Queued",
      required: true,
    },
    judge0Tokens: [{ token: String }],
    results: [testResultSchema],
    score: { type: Number, default: 0, min: 0, max: 100 },
    executionTime: { type: Number, default: 0 },
    memoryUsed: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// --- Indexing ---

submissionSchema.index({ user: 1, problem: 1, createdAt: -1 });

submissionSchema.index(
  { user: 1, problem: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["Queued", "Pending", "Judging"] },
    },
  },
);

const Submission = mongoose.model("Submission", submissionSchema);
export default Submission;