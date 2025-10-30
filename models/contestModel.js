import mongoose from "mongoose";

const contestProblemSchema = new mongoose.Schema({
    problem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Problem',
        required: true
    },

}, { _id: false });

const contestSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            unique: true,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        description: {
            type: String, // Can be Markdown/HTML
            required: true,
        },
        startTime: {
            type: Date,
            required: true,
        },
        endTime: {
            type: Date,
            required: true,
        },
        problems: [contestProblemSchema], // Array of problems included in the contest
        registeredUsers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            }
        ],
        // 'createdBy' field is good for tracking who made the contest
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // We'll add rankings later, maybe as a separate model
        // rankings: [ ... ]
    },
    {
        timestamps: true // Adds createdAt and updatedAt
    }
);

// Middleware to ensure endTime is after startTime
contestSchema.pre('save', function (next) {
    if (this.endTime <= this.startTime) {
        next(new Error('Contest end time must be after the start time.'));
    } else {
        next();
    }
});

const Contest = mongoose.model("Contest", contestSchema);
export default Contest;