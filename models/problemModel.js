import mongoose from "mongoose";

const starterCodeSchema = new mongoose.Schema(
  {
    language: { type: String, required: true, trim: true },
    code: { type: String, required: true },
  },
  { _id: false },
);

//  Sub-schema for parameter mapping
const parameterSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, required: true }
}, { _id: false });

//  Sub-schema to store the auto-generation blueprint
const signatureSchema = new mongoose.Schema({
    functionName: { type: String, required: true },
    returnType: { type: String, required: true },
    parameters: [parameterSchema]
}, { _id: false });

const problemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true, trim: true },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    description: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "Super Hard"],
      required: true,
    },

    tags: [{ type: String, trim: true, lowercase: true }],
    companyTags: [{ type: String, trim: true, lowercase: true }],

    // Execution limits & Signature blueprint
    signature: { type: signatureSchema, required: false },
    timeLimit: { type: Number, default: 2.0 }, // In seconds
    memoryLimit: { type: Number, default: 256000 }, // In KB (256MB)

    starterCode: [starterCodeSchema],
    driverCode: [
      {
        language: { type: String, required: true },
        code: { type: String, required: true },
      },
    ],

    testCases: [{ type: mongoose.Schema.Types.ObjectId, ref: "TestCase" }],
    maxTestCases: { type: Number, default: 100 }, 

    solution: { type: String, default: "" },
    isPremium: { type: Boolean, default: false, required: true },
    isPublished: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false }, 

    originContest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      default: null,
    },

    executionStats: {
      avgRuntime: { type: Number, default: 0 },
      avgMemory: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true, 
  },
);

//  Query Indexes
problemSchema.index({ isDeleted: 1, createdAt: -1 });
problemSchema.index({ isDeleted: 1, isPublished: 1, createdAt: -1 }); 
problemSchema.index({ slug: 1 }, { unique: true });
problemSchema.index({ title: "text" }); 
problemSchema.index({ difficulty: 1 }); 
problemSchema.index({ tags: 1 }); 
problemSchema.index({ companyTags: 1 });

const Problem = mongoose.model("Problem", problemSchema);
export default Problem;