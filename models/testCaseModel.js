import mongoose from "mongoose";

const testCaseSchema = new mongoose.Schema({
    problem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Problem",
        required: true,
    },
    input: {
        type: String,
        required: [true, "Test case input is required."],
    },
    expectedOutput: {
        type: String,
        required: [true, "Expected output is required."],
    },
    isSample: {
        type: Boolean,
        default: false,
        required: true,
    },
}, {
    timestamps: true,
});

testCaseSchema.index({ problem: 1, createdAt: 1 });

const TestCase = mongoose.model("TestCase", testCaseSchema);
export default TestCase;