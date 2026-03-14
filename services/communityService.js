import CommunityPost from '../models/communityPostModel.js';
import { calculateHotScore } from '../utils/hotScore.js';

export const applyGravityToHotPosts = async () => {
    // Grab the top 500 active posts that actually have a score > 0
    const hotPosts = await CommunityPost.find({ status: 'active', hotScore: { $gt: 0 } })
        .sort({ hotScore: -1 })
        .limit(500)
        .select('upvotes downvotes createdAt hotScore')
        .lean();

    if (hotPosts.length === 0) return;

    // Prepare BulkWrite operations for massive performance
    const bulkOps = hotPosts.map(post => {
        const newScore = calculateHotScore(post.upvotes, post.downvotes, post.createdAt);
        return {
            updateOne: {
                filter: { _id: post._id },
                update: { $set: { hotScore: newScore } }
            }
        };
    });

    if (bulkOps.length > 0) {
        await CommunityPost.bulkWrite(bulkOps);
    }
    
    console.log(`📉 Applied gravity decay to ${bulkOps.length} hot posts.`);
};