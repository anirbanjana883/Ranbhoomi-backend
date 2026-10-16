import CommunityPost from './models/communityPost.model.js';
import CommunityComment from './models/communityComment.model.js';
import CommunityVote from './models/communityVote.model.js';
import ProblemComment from './models/problemComment.model.js';

class CommunityRepository {
    async createPost(data) { return CommunityPost.create(data); }
    
    async findPosts(query, sort, skip, limit) {
        return CommunityPost.find(query).sort(sort).skip(skip).limit(limit).populate('author', 'name username photoUrl').lean();
    }
    
    async searchPosts(query, skip, limit) {
        return CommunityPost.find(query, { score: { $meta: "textScore" } })
            .sort({ score: { $meta: "textScore" } }).skip(skip).limit(limit)
            .populate('author', 'name username photoUrl').lean();
    }
    
    async countPosts(query) { return CommunityPost.countDocuments(query); }

    async incrementPostComment(postId) {
        return CommunityPost.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } }, { new: true });
    }

    async createComment(data) { return CommunityComment.create(data); }
    
    async findCommentById(id) { return CommunityComment.findById(id).lean(); }
    
    async findComments(query, sort, skip, limit) {
        let q = CommunityComment.find(query);
        if (sort) q = q.sort(sort);
        if (skip) q = q.skip(skip);
        if (limit) q = q.limit(limit);
        return q.populate('author', 'name username photoUrl').lean();
    }

    async findVote(userId, entityId) { return CommunityVote.findOne({ userId, entityId }); }
    async createVote(data) { return CommunityVote.create(data); }
    async deleteVote(id) { return CommunityVote.findByIdAndDelete(id); }
    async updateEntityVotes(Model, id, updateQuery) { return Model.findByIdAndUpdate(id, updateQuery, { new: true }).select('upvotes downvotes createdAt'); }
    async fireAndForgetHotScore(id, score) { CommunityPost.findByIdAndUpdate(id, { hotScore: score }).exec(); }

    async softDeletePost(id, userId) {
        return CommunityPost.findOneAndUpdate({ _id: id, author: userId, status: { $ne: 'deleted' } }, { $set: { status: 'deleted', content: '[This post was deleted by the author]' } }, { new: true });
    }

    async softDeleteComment(id, userId) {
        return CommunityComment.findOneAndUpdate({ _id: id, author: userId, isDeleted: false }, { $set: { isDeleted: true, content: '[deleted]' } }, { new: true });
    }

    // Problem Comments
    async getProblemComments(slug) { return ProblemComment.find({ problemSlug: slug }).populate("user", "name username photoUrl").sort({ createdAt: -1 }); }
    async createProblemComment(data) { const c = new ProblemComment(data); await c.save(); return c.populate("user", "name username photoUrl"); }
    async deleteProblemComment(id) { return ProblemComment.findById(id); }
}

export default new CommunityRepository();