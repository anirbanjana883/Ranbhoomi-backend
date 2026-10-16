import express from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { isAuth } from "../../shared/middlewares/auth.middleware.js";
import { verifyCronSecret } from "../../shared/middlewares/cron.middleware.js";
import {
    createPost, getPosts, searchPosts, deletePost,
    addComment, getComments, getReplies, deleteComment,
    toggleVote, decayGravityCron,
    getProblemComments, addProblemComment, deleteProblemComment
} from "./community.controller.js";

const router = express.Router();

router.post("/cron/decay", verifyCronSecret, asyncHandler(decayGravityCron));

router.get("/posts", asyncHandler(getPosts));
router.get("/posts/search", asyncHandler(searchPosts));
router.post("/posts", isAuth, asyncHandler(createPost));
router.delete("/posts/:postId", isAuth, asyncHandler(deletePost));

router.post("/comments", isAuth, asyncHandler(addComment));
router.get("/posts/:postId/comments", asyncHandler(getComments));
router.get("/comments/:commentId/replies", asyncHandler(getReplies));
router.delete("/comments/:commentId", isAuth, asyncHandler(deleteComment));
router.post("/vote", isAuth, asyncHandler(toggleVote));

// Problem-Specific Comments
router.get("/problem/:slug", asyncHandler(getProblemComments));
router.post("/problem/:slug", isAuth, asyncHandler(addProblemComment));
router.delete("/problem/comment/:id", isAuth, asyncHandler(deleteProblemComment));

export default router;