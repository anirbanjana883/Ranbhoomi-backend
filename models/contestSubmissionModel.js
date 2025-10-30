import mongoose from "mongoose";

const testResultSchema = new mongoose.Schema(
  {
    testCase: { type: mongoose.Schema.Types.ObjectId, ref: "TestCase" },
    status: {
      type: String,
      enum: ["Passed", "Failed", "Error"],
      required: true,
    },
    output: { type: String, default: "" },
  },
  { _id: false }
);

const contestSubmissionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
      index: true,
    },
    contest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    code: { type: String, required: true },
    language: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: [
        "Pending",
        "Judging",
        "Accepted",
        "Wrong Answer",
        "Time Limit Exceeded",
        "Runtime Error",
        "Compilation Error",
        "Memory Limit Exceeded",
      ],
      default: "Pending",
      required: true,
    },
    judge0Tokens: [{ token: { type: String, required: true } }],
    testCases: [{ type: mongoose.Schema.Types.ObjectId, ref: "TestCase" }],
    results: [testResultSchema],
    
    submissionTime: { type: Date, default: Date.now }, 
    // You can add 'penalty' or 'points' here later
  },
  {
    timestamps: true,
  }
);

const ContestSubmission = mongoose.model(
  "ContestSubmission",
  contestSubmissionSchema
);
export default ContestSubmission;
