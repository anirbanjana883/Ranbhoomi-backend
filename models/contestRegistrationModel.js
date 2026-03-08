import mongoose from "mongoose";

const contestRegistrationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        contest: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Contest",
            required: true,
            index: true
        },
        registeredAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

contestRegistrationSchema.index({ user: 1, contest: 1 }, { unique: true });

const ContestRegistration = mongoose.model("ContestRegistration", contestRegistrationSchema);
export default ContestRegistration;