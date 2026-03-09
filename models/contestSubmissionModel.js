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
        "Queued", 
        "Pending",
        "Judging",
        "Accepted",
        "Wrong Answer",
        "Time Limit Exceeded",
        "Runtime Error",
        "Compilation Error",
        "Memory Limit Exceeded",
        "Internal Error" 
      ],
      default: "Queued",
      required: true,
    },
    
    judge0Tokens: [{ token: { type: String, required: true } }],
    testCases: [{ type: mongoose.Schema.Types.ObjectId, ref: "TestCase" }],
    results: [testResultSchema],
    
    score: { 
        type: Number, 
        default: 0,
        index: true 
    },

    executionTime: { type: Number, default: 0 },
    memoryUsed: { type: Number, default: 0 },

    submissionTime: { type: Date, default: Date.now }, 
  },
  {
    timestamps: true,
  }
);

contestSubmissionSchema.index({ user: 1, problem: 1, contest: 1, createdAt: -1 });

const ContestSubmission = mongoose.model("ContestSubmission", contestSubmissionSchema);
export default ContestSubmission;