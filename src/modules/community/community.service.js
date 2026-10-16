import sanitizeHtml from 'sanitize-html';
import mongoose from 'mongoose';
import communityRepository from './community.repository.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import CommunityPost from './models/communityPost.model.js';
import CommunityComment from './models/communityComment.model.js';

const sanitizeOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'code', 'pre', 'span', 'h1', 'h2', 'h3']),
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ['src', 'alt'], span: ['class'] }
};

const calculateHotScore = (upvotes, downvotes, createdAt) => {
    const score = Math.max(upvotes - downvotes, 0); 
    const hoursSincePost = (Date.now() - new Date(createdAt).getTime()) / 3600000;
    return score / Math.pow(Math.max(hoursSincePost, 0) + 2, 1.5);
};

class CommunityService {
    async createPost(userId, title, content, tags) {
        if (!title || !content) throw new ApiError(400, "Title and content required");
        if (content.length > 50000) throw new ApiError(413, "Content exceeds 50k chars");
        return communityRepository.createPost({
            author: userId, title: title.trim(), content: sanitizeHtml(content, sanitizeOptions),
            tags: Array.isArray(tags) ? tags.map(t => t.toLowerCase().trim()) : []
        });
    }

    async getPosts(cursor, page, limit, tag, sort) {
        const query = { status: 'active' };
        if (tag) query.tags = tag.toLowerCase();

        let posts, nextCursor = null, nextPage = null;
        if (sort === 'new') {
            if (cursor) query._id = { $lt: cursor };
            posts = await communityRepository.findPosts(query, { createdAt: -1, _id: -1 }, 0, Number(limit) + 1);
            if (posts.length > limit) { posts.pop(); nextCursor = posts[posts.length - 1]._id; }
        } else {
            const skipAmt = (Number(page) - 1) * Number(limit);
            posts = await communityRepository.findPosts(query, { hotScore: -1, _id: -1 }, skipAmt, Number(limit));
            nextPage = posts.length === Number(limit) ? Number(page) + 1 : null;
        }
        return { posts, nextCursor, nextPage };
    }

    async searchPosts(q, page, limit) {
        if (!q?.trim()) throw new ApiError(400, "Query required");
        const skip = (Number(page) - 1) * Number(limit);
        const query = { status: 'active', $text: {$search: q } };
        const posts = await communityRepository.searchPosts(query, skip, Number(limit));
        const total = await communityRepository.countPosts(query);
        const totalPages = Math.ceil(total / Number(limit));
        return { posts, currentPage: Number(page), totalPages, hasNextPage: page < totalPages };
    }

    async addComment(userId, postId, content, parentCommentId) {
        if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid Post ID");
        if (!content || content.length > 10000) throw new ApiError(400, "Invalid content");

        const commentId = new mongoose.Types.ObjectId();
        let path = `,${commentId},`, level = 1;

        if (parentCommentId) {
            const parent = await communityRepository.findCommentById(parentCommentId);
            if (!parent || parent.postId.toString() !== postId) throw new ApiError(400, "Invalid Parent");
            level = parent.level + 1;
            if (level > 10) throw new ApiError(400, "Max depth 10 reached");
            path = `${parent.path}${commentId},`;
        }

        const post = await communityRepository.incrementPostComment(postId);
        if (!post) throw new ApiError(404, "Post not found");

        return communityRepository.createComment({ _id: commentId, postId, author: userId, content: sanitizeHtml(content, sanitizeOptions), parentCommentId: parentCommentId || null, path, level });
    }

    async getThreadedComments(postId, page, limit) {
        if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid Post ID");
        const skipAmt = (Number(page) - 1) * Number(limit);
        const roots = await communityRepository.findComments({ postId, level: 1, isDeleted: false }, { upvotes: -1, createdAt: -1 }, skipAmt, Number(limit));
        if (!roots.length) return [];

        const pathRegex = new RegExp(`^(${roots.map(c => c.path).join('|')})`);
        const all = await communityRepository.findComments({ postId, path: { $regex: pathRegex } }, { path: 1 });

        const map = {}, nested = [];
        for (const c of all) {
            if (c.isDeleted) { c.content = "[Deleted]"; c.author = { name: "[Deleted]", username: "deleted" }; }
            c.children = []; map[c._id] = c;
            if (c.parentCommentId && map[c.parentCommentId]) map[c.parentCommentId].children.push(c);
            else nested.push(c);
        }
        nested.sort((a, b) => b.upvotes - a.upvotes || new Date(b.createdAt) - new Date(a.createdAt));
        return nested;
    }

    async getReplies(commentId) {
        if (!mongoose.Types.ObjectId.isValid(commentId)) throw new ApiError(400, "Invalid Comment ID");
        const parent = await communityRepository.findCommentById(commentId);
        if (!parent) throw new ApiError(404, "Not found");

        const replies = await communityRepository.findComments({ _id: { $ne: parent._id }, path: {$regex: new RegExp(`^${parent.path}`) } }, { path: 1 });
        const map = {}, roots = [];
        for (const c of replies) {
            if (c.isDeleted) c.content = "[Deleted]";
            c.children = []; map[c._id] = c;
            if (c.parentCommentId.toString() === parent._id.toString()) roots.push(c);
            else if (map[c.parentCommentId]) map[c.parentCommentId].children.push(c);
        }
        return roots;
    }

    async toggleVote(userId, entityId, entityType, voteType) {
        if (!mongoose.Types.ObjectId.isValid(entityId) || ![1, -1].includes(voteType) || !['CommunityPost', 'CommunityComment'].includes(entityType)) throw new ApiError(400, "Invalid input");

        const Model = entityType === 'CommunityPost' ? CommunityPost : CommunityComment;
        const exist = await communityRepository.findVote(userId, entityId);
        let updateQuery;

        if (exist) {
            if (exist.voteType === voteType) {
                await communityRepository.deleteVote(exist._id);
                updateQuery = { $inc: voteType === 1 ? { upvotes: -1 } : { downvotes: -1 } };
            } else {
                exist.voteType = voteType; await exist.save();
                updateQuery = { $inc: voteType === 1 ? { upvotes: 1, downvotes: -1 } : { upvotes: -1, downvotes: 1 } };
            }
        } else {
            await communityRepository.createVote({ userId, entityId, entityType, voteType });
            updateQuery = { $inc: voteType === 1 ? { upvotes: 1 } : { downvotes: 1 } };
        }

        const updated = await communityRepository.updateEntityVotes(Model, entityId, updateQuery);
        if (entityType === 'CommunityPost') communityRepository.fireAndForgetHotScore(entityId, calculateHotScore(updated.upvotes, updated.downvotes, updated.createdAt));
        return updated;
    }

    async applyGravityToHotPosts() {
        const posts = await CommunityPost.find({ status: 'active', hotScore: { $gt: 0 } }).sort({ hotScore: -1 }).limit(500).select('upvotes downvotes createdAt').lean();
        if (!posts.length) return;
        const ops = posts.map(p => ({ updateOne: { filter: { _id: p._id }, update: { $set: { hotScore: calculateHotScore(p.upvotes, p.downvotes, p.createdAt) } } } }));
        await CommunityPost.bulkWrite(ops);
    }
}

export default new CommunityService();