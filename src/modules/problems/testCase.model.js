import mongoose from "mongoose";

const testCaseSchema = new mongoose.Schema({
    problem: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true },
    input: { type: String, required: true },
    expectedOutput: { type: String, required: true },
    isSample: { type: Boolean, default: false, required: true },
}, { timestamps: true });

testCaseSchema.index({ problem: 1, createdAt: 1 });

export default mongoose.model("TestCase", testCaseSchema);