import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import CommunityPost from '../models/communityPostModel.js';
import CommunityComment from '../models/communityCommentModel.js';
import CommunityVote from '../models/communityVoteModel.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { calculateHotScore } from '../utils/hotScore.js';

// Configuration for Markdown Sanitization
const sanitizeOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'code', 'pre', 'span', 'h1', 'h2', 'h3']),
    allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt'],
        span: ['class'] 
    }
};

// CREATE POST
// FAANG Optimization: Payload limits & XSS Sanitization
export const createPost = asyncHandler(async (req, res) => {
    let { title, content, tags } = req.body;
    const userId = req.userId;

    if (!title || !content) throw new ApiError(400, "Title and content are required.");
    
    // Safety: Prevent massive payloads crashing memory
    if (content.length > 50000) throw new ApiError(413, "Content exceeds 50,000 character limit.");

    // Security: Sanitize markdown to prevent <script> XSS injections
    const cleanContent = sanitizeHtml(content, sanitizeOptions);

    const post = await CommunityPost.create({
        author: userId,
        title: title.trim(),
        content: cleanContent,
        tags: Array.isArray(tags) ? tags.map(t => t.toLowerCase().trim()) : []
    });

    return res.status(201).json(new ApiResponse(201, post, "Post created successfully"));
});

//  GET POSTS (CURSOR-BASED PAGINATION)
export const getPosts = asyncHandler(async (req, res) => {
    const { cursor, page = 1, limit = 20, tag, sort = 'hot' } = req.query;
    
    const query = { status: 'active' };
    if (tag) query.tags = tag.toLowerCase();

    let posts;
    let nextCursor = null;
    let nextPage = null;

    if (sort === 'new') {
        // "New" Feed: Fast Cursor Pagination
        if (cursor) query._id = { $lt: cursor };
        
        posts = await CommunityPost.find(query)
            .sort({ createdAt: -1, _id: -1 })
            .limit(Number(limit) + 1)
            .populate('author', 'name username profilePicture')
            .lean();

        const hasNext = posts.length > limit;
        if (hasNext) posts.pop();
        nextCursor = hasNext ? posts[posts.length - 1]._id : null;

    } else {
        // "Hot" Feed: Offset Pagination
        const skipAmt = (Number(page) - 1) * Number(limit);
        
        posts = await CommunityPost.find(query)
            .sort({ hotScore: -1, _id: -1 })
            .skip(skipAmt)
            .limit(Number(limit))
            .populate('author', 'name username profilePicture')
            .lean();
            
        // If we got a full page, assume there might be a next page
        nextPage = posts.length === Number(limit) ? Number(page) + 1 : null;
    }

    return res.status(200).json(
        new ApiResponse(200, { posts, nextCursor, nextPage }, "Posts fetched successfully")
    );
});

// ADD COMMENT (MATERIALIZED PATH ENGINE)
// FAANG Optimization: Depth limits & Atomic Existence Checks
export const addComment = asyncHandler(async (req, res) => {
    const { postId, content, parentCommentId } = req.body;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid Post ID.");
    if (!content) throw new ApiError(400, "Content is required.");
    if (content.length > 10000) throw new ApiError(413, "Comment exceeds 10,000 character limit.");

    const cleanContent = sanitizeHtml(content, sanitizeOptions);
    const commentId = new mongoose.Types.ObjectId();
    let path = `,${commentId},`;
    let level = 1;

    if (parentCommentId) {
        if (!mongoose.Types.ObjectId.isValid(parentCommentId)) throw new ApiError(400, "Invalid Parent Comment ID.");
        
        const parent = await CommunityComment.findById(parentCommentId).lean();
        if (!parent) throw new ApiError(404, "Parent comment not found.");
        if (parent.postId.toString() !== postId) throw new ApiError(400, "Post ID mismatch.");
        
        level = parent.level + 1;
        // Safety: Prevent infinite nesting breaking the UI
        if (level > 10) throw new ApiError(400, "Maximum reply depth of 10 reached.");
        
        path = `${parent.path}${commentId},`;
    }

    // Safety: Atomically increment AND check if post exists in one trip
    const post = await CommunityPost.findByIdAndUpdate(
        postId, 
        { $inc: { commentCount: 1 } },
        { new: true }
    );
    if (!post) throw new ApiError(404, "Post not found or has been deleted.");

    const comment = await CommunityComment.create({
        _id: commentId,
        postId,
        author: userId,
        content: cleanContent,
        parentCommentId: parentCommentId || null,
        path,
        level
    });

    return res.status(201).json(new ApiResponse(201, comment, "Comment added successfully"));
});

// GET COMMENTS ( OPTIMIZED: 2-Step Root Pagination + Tree Build)
export const getComments = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid Post ID.");

    const skipAmt = (Number(page) - 1) * Number(limit);

    //   ONLY the paginated top-level (root) comments
    const rootComments = await CommunityComment.find({ postId, level: 1, isDeleted: false })
        .sort({ upvotes: -1, createdAt: -1 }) 
        .skip(skipAmt)
        .limit(Number(limit))
        .lean();

    if (rootComments.length === 0) {
        return res.status(200).json(new ApiResponse(200, [], "No comments found."));
    }

    //  Extract their paths to fetch ONLY their subtrees
    const rootPaths = rootComments.map(c => c.path);
    
    const pathRegex = new RegExp(`^(${rootPaths.join('|')})`);

    const allCommentsInThreads = await CommunityComment.find({
        postId,
        path: { $regex: pathRegex }
    })
    .sort({ path: 1 }) 
    .populate('author', 'name username profilePicture')
    .lean();

    //  O(N) In-Memory Tree Reconstruction
    const commentMap = {};
    const nestedComments = [];

    for (const comment of allCommentsInThreads) {
        if (comment.isDeleted) {
            comment.content = "[This comment was deleted]";
            comment.author = { name: "[Deleted]", username: "deleted" };
        }

        comment.children = [];
        commentMap[comment._id] = comment;

        if (comment.parentCommentId && commentMap[comment.parentCommentId]) {
            commentMap[comment.parentCommentId].children.push(comment);
        } else {
            nestedComments.push(comment);
        }
    }

    nestedComments.sort((a, b) => b.upvotes - a.upvotes || new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json(new ApiResponse(200, nestedComments, "Comment tree rebuilt successfully"));
});

// GET REPLIES (Reddit-style Lazy Loading for Deep Threads)
export const getReplies = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) throw new ApiError(400, "Invalid Comment ID.");

    // 1. Get the parent comment to find its path
    const parent = await CommunityComment.findById(commentId).lean();
    if (!parent) throw new ApiError(404, "Comment not found.");

    // 2. Fetch everything that starts with the parent's path (excluding the parent itself)
    const repliesRegex = new RegExp(`^${parent.path}`);
    
    const replies = await CommunityComment.find({
        _id: { $ne: parent._id }, // Don't fetch the parent again
        path: { $regex: repliesRegex }
    })
    .sort({ path: 1 })
    .populate('author', 'name username profilePicture')
    .lean();

    // 3. Rebuild the subtree
    const commentMap = {};
    const rootReplies = [];

    for (const comment of replies) {
        if (comment.isDeleted) comment.content = "[This comment was deleted]";
        comment.children = [];
        commentMap[comment._id] = comment;

        // If the reply's direct parent is the comment we queried, it's a "root" of this subtree
        if (comment.parentCommentId.toString() === parent._id.toString()) {
            rootReplies.push(comment);
        } else if (commentMap[comment.parentCommentId]) {
            commentMap[comment.parentCommentId].children.push(comment);
        }
    }

    return res.status(200).json(new ApiResponse(200, rootReplies, "Subtree replies fetched successfully"));
});

// TOGGLE VOTE 
// FAANG Optimization: ObjectId Validation
export const toggleVote = asyncHandler(async (req, res) => {
    const { entityId, entityType, voteType } = req.body; 
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(entityId)) throw new ApiError(400, "Invalid Entity ID.");
    if (![1, -1].includes(voteType)) throw new ApiError(400, "Invalid vote type.");
    if (!['CommunityPost', 'CommunityComment'].includes(entityType)) throw new ApiError(400, "Invalid entity type.");

    const Model = entityType === 'CommunityPost' ? CommunityPost : CommunityComment;

    const existingVote = await CommunityVote.findOne({ userId, entityId });
    let updateQuery = {};

    if (existingVote) {
        if (existingVote.voteType === voteType) {
            await CommunityVote.findByIdAndDelete(existingVote._id);
            updateQuery = { $inc: voteType === 1 ? { upvotes: -1 } : { downvotes: -1 } };
        } else {
            existingVote.voteType = voteType;
            await existingVote.save();
            updateQuery = { $inc: voteType === 1 ? { upvotes: 1, downvotes: -1 } : { upvotes: -1, downvotes: 1 } };
        }
    } else {
        await CommunityVote.create({ userId, entityId, entityType, voteType });
        updateQuery = { $inc: voteType === 1 ? { upvotes: 1 } : { downvotes: 1 } };
    }

    const updatedEntity = await Model.findByIdAndUpdate(entityId, updateQuery, { new: true })
        .select('upvotes downvotes createdAt');

    if (entityType === 'CommunityPost') {
        const newHotScore = calculateHotScore(
            updatedEntity.upvotes, 
            updatedEntity.downvotes, 
            updatedEntity.createdAt
        );
        // Fire and forget (no need to await this and slow down the user's click)
        CommunityPost.findByIdAndUpdate(entityId, { hotScore: newHotScore }).exec();
    }
    return res.status(200).json(new ApiResponse(200, updatedEntity, "Vote registered successfully"));
});

// SOFT DELETE POST
export const deletePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(postId)) throw new ApiError(400, "Invalid Post ID.");

    const post = await CommunityPost.findOneAndUpdate(
        { _id: postId, author: userId, status: { $ne: 'deleted' } },
        { $set: { status: 'deleted', content: '[This post was deleted by the author]' } },
        { new: true }
    );

    if (!post) throw new ApiError(404, "Post not found or unauthorized.");

    return res.status(200).json(new ApiResponse(200, null, "Post deleted successfully"));
});

// SOFT DELETE COMMENT
export const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(commentId)) throw new ApiError(400, "Invalid Comment ID.");

    // Soft delete replaces content but keeps the path intact to preserve children
    const comment = await CommunityComment.findOneAndUpdate(
        { _id: commentId, author: userId, isDeleted: false },
        { $set: { isDeleted: true, content: '[deleted]' } },
        { new: true }
    );

    if (!comment) throw new ApiError(404, "Comment not found or unauthorized.");

    return res.status(200).json(new ApiResponse(200, null, "Comment deleted successfully"));
});


// EARCH POSTS (Weighted Text Search)
// FAANG Optimization: Sorting by MongoDB internal TextScore for relevance
export const searchPosts = asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q || q.trim() === '') {
        throw new ApiError(400, "Search query is required.");
    }

    const skipAmt = (Number(page) - 1) * Number(limit);

    // Fetch posts matching the text, project the textScore, and sort by it
    const posts = await CommunityPost.find(
        { status: 'active', $text: { $search: q } },
        { score: { $meta: "textScore" } } // Project the relevance score
    )
    .sort({ score: { $meta: "textScore" } }) // Sort highest relevance first
    .skip(skipAmt)
    .limit(Number(limit))
    .populate('author', 'name username profilePicture')
    .lean();

    // Optional: Count total results for frontend pagination controls
    const totalResults = await CommunityPost.countDocuments({ 
        status: 'active', 
        $text: { $search: q } 
    });
    
    const totalPages = Math.ceil(totalResults / Number(limit));

    return res.status(200).json(
        new ApiResponse(200, { 
            posts, 
            currentPage: Number(page),
            totalPages,
            hasNextPage: page < totalPages
        }, "Search results fetched successfully")
    );
});