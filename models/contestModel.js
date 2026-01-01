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
        visibility: {
            type: String,
            enum: ['PUBLIC', 'PRIVATE'],
            default: 'PUBLIC',
            index: true 
        },
        inviteCode: {
            type: String,
            unique: true, 
            sparse: true, 
            trim: true
        },
        problems: [contestProblemSchema], 
        registeredUsers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            }
        ],
        
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        problemsPublished: {
            type: Boolean,
            default: false,
            index: true,
        },

    },
    {
        timestamps: true 
    }
);


contestSchema.pre('save', function (next) {
    if (this.endTime <= this.startTime) {
        next(new Error('Contest end time must be after the start time.'));
    } else {
        next();
    }
});

const Contest = mongoose.model("Contest", contestSchema);
export default Contest;