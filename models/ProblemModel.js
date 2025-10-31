import mongoose from "mongoose";


const starterCodeSchema = new mongoose.Schema({
    language: {
        type: String,
        required: true,
        trim: true,
    },
    code: {
        type: String,
        required: true,
    },
}, { _id: false });


const problemSchema = new mongoose.Schema(
    {

        title: {
            type: String,
            required: [true, "Problem title is required."],
            unique: true,
            trim: true,
        },
        slug: {
            type: String,
            required: [true, "Problem slug is required."],
            unique: true,
            lowercase: true,
            trim: true,
        },
        description: {
            type: String,
            required: [true, "Problem description is required."],
        },
        difficulty: {
            type: String,
            enum: ["Easy", "Medium", "Hard" , "Super Hard"],
            required: [true, "Difficulty level is required."],
        },

        tags: [ 
            {
                type: String,
                trim: true,
                lowercase: true, 
            },
        ],

       companyTags: [{ 
            type: String,
            trim: true,
            lowercase: true, 
        }],

        starterCode: [starterCodeSchema],
        testCases: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "TestCase",
            },
        ],

        solution: {
            type: String,
            default: "",
        },

        isPremium: {
            type: Boolean,
            default: false, 
            required: true,
        },
        isPublished: {
            type: Boolean,
            default: true, 
            index: true,
        },
        originContest: { 
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Contest',
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const Problem = mongoose.model("Problem", problemSchema);
export default Problem;