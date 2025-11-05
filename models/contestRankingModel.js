import mongoose from "mongoose";

const problemResultSchema = new mongoose.Schema({
    problem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Problem',
        required: true
    },
    status: {
        type: String,
        enum: ['Accepted', 'Attempted'], 
        required: true
    },
    submissionTime: { 
        type: Number,
        required: true
    },
    penalty: { 
        type: Number,
        default: 0
    }
}, { _id: false });

const rankingEntrySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rank: {
        type: Number,
        required: true,
        index: true
    },
    totalScore: { 
        type: Number,
        required: true,
        default: 0
    },
    totalPenalty: { 
        type: Number,
        required: true,
        default: 0
    },
    problemResults: [problemResultSchema]
}, { _id: false });


const contestRankingSchema = new mongoose.Schema({
    contest: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contest',
        required: true,
        unique: true, 
        index: true
    },
    rankings: [rankingEntrySchema], 
    calculatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const ContestRanking = mongoose.model("ContestRanking", contestRankingSchema);
export default ContestRanking;