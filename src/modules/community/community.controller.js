import communityService from "./community.service.js";
import communityRepository from "./community.repository.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";
import { ApiError } from "../../shared/utils/ApiError.js";

export const createPost = async (req, res) => res.status(201).json(new ApiResponse(201, await communityService.createPost(req.userId, req.body.title, req.body.content, req.body.tags), "Created"));
export const getPosts = async (req, res) => res.status(200).json(new ApiResponse(200, await communityService.getPosts(req.query.cursor, req.query.page, req.query.limit, req.query.tag, req.query.sort), "Fetched"));
export const searchPosts = async (req, res) => res.status(200).json(new ApiResponse(200, await communityService.searchPosts(req.query.q, req.query.page, req.query.limit), "Searched"));
export const deletePost = async (req, res) => {
    const post = await communityRepository.softDeletePost(req.params.postId, req.userId);
    if (!post) throw new ApiError(404, "Not found or unauthorized");
    res.status(200).json(new ApiResponse(200, null, "Deleted"));
};

export const addComment = async (req, res) => res.status(201).json(new ApiResponse(201, await communityService.addComment(req.userId, req.body.postId, req.body.content, req.body.parentCommentId), "Added"));
export const getComments = async (req, res) => res.status(200).json(new ApiResponse(200, await communityService.getThreadedComments(req.params.postId, req.query.page, req.query.limit), "Fetched"));
export const getReplies = async (req, res) => res.status(200).json(new ApiResponse(200, await communityService.getReplies(req.params.commentId), "Fetched"));
export const deleteComment = async (req, res) => {
    const c = await communityRepository.softDeleteComment(req.params.commentId, req.userId);
    if (!c) throw new ApiError(404, "Not found or unauthorized");
    res.status(200).json(new ApiResponse(200, null, "Deleted"));
};

export const toggleVote = async (req, res) => res.status(200).json(new ApiResponse(200, await communityService.toggleVote(req.userId, req.body.entityId, req.body.entityType, req.body.voteType), "Voted"));
export const decayGravityCron = async (req, res) => { await communityService.applyGravityToHotPosts(); res.status(200).json(new ApiResponse(200, null, "Decayed")); };

export const getProblemComments = async (req, res) => res.status(200).json(new ApiResponse(200, await communityRepository.getProblemComments(req.params.slug)));
export const addProblemComment = async (req, res) => {
    if (!req.body.text?.trim()) throw new ApiError(400, "Empty");
    res.status(201).json(new ApiResponse(201, await communityRepository.createProblemComment({ user: req.userId, problemSlug: req.params.slug, text: req.body.text })));
};
export const deleteProblemComment = async (req, res) => {
    const c = await communityRepository.deleteProblemComment(req.params.id);
    if (!c) throw new ApiError(404, "Not found");
    if (c.user.toString() !== req.userId) throw new ApiError(403, "Unauthorized");
    await c.deleteOne();
    res.status(200).json(new ApiResponse(200, null, "Deleted"));
};