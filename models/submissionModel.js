import mongoose from "mongoose";

const testResultSchema = new mongoose.Schema({
    testCase: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TestCase",
        required: true,
    },
    status: {
        type: String,
        enum: ['Passed', 'Failed', 'Error', 'Judging'], // Added Judging here just in case frontend needs it per case
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
                'Queued', 
                'Pending', 'Judging', 'Accepted', 'Wrong Answer',
                'Time Limit Exceeded', 'Runtime Error', 'Compilation Error',
                'Memory Limit Exceeded',
            ],
            default: 'Queued', 
            required: true,
        },

        judge0Tokens: [
            {
                token: { type: String, required: true }
            }
        ],

        testCases: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "TestCase"
            }
        ],

        results: [testResultSchema],

        score: { 
            type: Number, 
            default: 0, 
            min: 0,
            max: 100
        },
    },
    {
        timestamps: true,
    }
);

const Submission = mongoose.model("Submission", submissionSchema);
export default Submission;