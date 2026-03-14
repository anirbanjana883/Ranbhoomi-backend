import mongoose from 'mongoose';

const communityPostSchema = new mongoose.Schema({
    author: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        index: true 
    },
    title: { 
        type: String, 
        required: true, 
        trim: true, 
        maxlength: 300 
    },
    content: { 
        type: String, 
        required: true 
    }, 
    tags: [{ 
        type: String, 
        trim: true,
        index: true 
    }],
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    isPinned: { type: Boolean, default: false },
    status: { 
        type: String, 
        enum: ['active', 'locked', 'deleted'], 
        default: 'active' 
    },
    hotScore: { type: Number, default: 0 }
}, { timestamps: true });

communityPostSchema.index({ status: 1, createdAt: -1, _id: -1 }); // For the "New" feed
communityPostSchema.index({ status: 1, hotScore: -1, _id: -1 });  // For the "Hot" feed

communityPostSchema.index(
    { title: 'text', tags: 'text', content: 'text' },
    { 
        weights: { title: 10, tags: 5, content: 1 }, 
        name: "CommunitySearchIndex" 
    }
);

export default mongoose.model('CommunityPost', communityPostSchema);