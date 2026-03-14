import mongoose from 'mongoose';

const communityCommentSchema = new mongoose.Schema({
    postId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CommunityPost', 
        required: true, 
        index: true 
    },
    author: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    content: { 
        type: String, 
        required: true 
    },
    // --- THE MATERIALIZED PATH ---
    parentCommentId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CommunityComment', 
        default: null 
    },
    path: { 
        type: String, 
        required: true, 
        index: true // Enables O(1) fetching of deeply nested trees
    },
    level: { 
        type: Number, 
        default: 1 
    },
    // -----------------------------
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false } 
}, { timestamps: true });

// Index 1: For the Regex Tree Reconstruction (O(1) nested fetching)
communityCommentSchema.index({ postId: 1, path: 1 });

// Index 2: NEW! For lightning-fast Root Comment Pagination 
// Matches: find({ postId, level: 1, isDeleted: false }).sort({ upvotes: -1, createdAt: -1 })
communityCommentSchema.index({ 
    postId: 1, 
    level: 1, 
    isDeleted: 1, 
    upvotes: -1, 
    createdAt: -1 
});

export default mongoose.model('CommunityComment', communityCommentSchema);