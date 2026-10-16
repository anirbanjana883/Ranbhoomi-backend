import mongoose from 'mongoose';

const communityVoteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    entityType: { type: String, enum: ['CommunityPost', 'CommunityComment'], required: true },
    voteType: { type: Number, enum: [1, -1], required: true }
}, { timestamps: true });

communityVoteSchema.index({ userId: 1, entityId: 1 }, { unique: true });

export default mongoose.model('CommunityVote', communityVoteSchema);