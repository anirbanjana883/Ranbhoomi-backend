import { Router } from 'express';
import isAuth from '../middleware/isAuth.js';
import {
    createPost,
    getPosts,
    addComment,
    getComments,
    toggleVote,
    searchPosts,
    getReplies,
    deletePost,      // <-- Imported
    deleteComment    // <-- Imported
} from '../controller/communityController.js';
import { communityPostLimiter, communityCommentLimiter } from '../middleware/rateLimiter.js';

const communityRouter = Router();

// ==========================================
// PUBLIC ROUTES (No login required)
// ==========================================

// Search Posts (Placed at the top to prevent route param collisions)
communityRouter.get('/search', searchPosts);

// Get a paginated list of all community posts (Cursor-based)
communityRouter.get('/posts', getPosts);

// Get paginated top-level comments and rebuild their trees
communityRouter.get('/posts/:postId/comments', getComments);

// Get lazy-loaded replies for a specific deeply-nested comment
communityRouter.get('/comments/:commentId/replies', getReplies);


// ==========================================
// PROTECTED ROUTES (Login required)
// ==========================================

// Create a new post (max 5 per min)
communityRouter.post('/post', isAuth, communityPostLimiter, createPost);

// Add a comment (max 20 per min)
communityRouter.post('/comment', isAuth, communityCommentLimiter, addComment);

// Toggle an upvote/downvote on a Post or Comment
communityRouter.patch('/vote', isAuth, toggleVote);

// Soft delete a post
communityRouter.delete('/posts/:postId', isAuth, deletePost);

// Soft delete a comment
communityRouter.delete('/comments/:commentId', isAuth, deleteComment);

export default communityRouter;