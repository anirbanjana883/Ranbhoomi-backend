import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxLength: 100 },
    content: { type: String, required: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    hotScore: { type: Number, default: 0, index: true },
    commentCount: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    isSolved: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "deleted"], default: "active", index: true }
}, { timestamps: true });

postSchema.index({ status: 1, hotScore: -1, _id: -1 });
postSchema.index({ status: 1, createdAt: -1, _id: -1 });
postSchema.index({ tags: 1, status: 1 });
postSchema.index({ title: "text", content: "text" });

export default mongoose.model("CommunityPost", postSchema);