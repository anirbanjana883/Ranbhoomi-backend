import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    problemSlug: { type: String, required: true, index: true },
    text: { type: String, required: true, trim: true },
}, { timestamps: true });

export default mongoose.model("ProblemComment", commentSchema);