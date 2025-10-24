import mongoose from "mongoose";

const testResultSchema = new mongoose.Schema({
    testCase: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TestCase",
        required: true,
    },
    status: {
        type: String,
        enum: ['Passed', 'Failed', 'Error'],
        required: true,
    },
    output: {
        type: String,
        default: "",
    },
}, { _id: false });

const submissionSchema = new mongoose.Schema(
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
        code: {
            type: String,
            required: true,
        },
        language: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        status: {
            type: String,
            enum: [
                'Pending', 'Judging', 'Accepted', 'Wrong Answer',
                'Time Limit Exceeded', 'Runtime Error', 'Compilation Error',
                'Memory Limit Exceeded',
            ],
            default: 'Pending',
            required: true,
        },
        results: [testResultSchema],
    },
    {
        timestamps: true,
    }
);

const Submission = mongoose.model("Submission", submissionSchema);
export default Submission;