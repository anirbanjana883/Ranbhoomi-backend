import mongoose from 'mongoose';

const communityVoteSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    entityId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true 
    }, 
    entityType: { 
        type: String, 
        enum: ['CommunityPost', 'CommunityComment'], 
        required: true 
    },
    voteType: { 
        type: Number, 
        enum: [1, -1], // 1 for Upvote, -1 for Downvote
        required: true 
    }
}, { timestamps: true });

// Unique index prevents double-voting race conditions
communityVoteSchema.index({ userId: 1, entityId: 1 }, { unique: true });

export default mongoose.model('CommunityVote', communityVoteSchema);