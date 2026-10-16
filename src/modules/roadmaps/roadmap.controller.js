import roadmapService from './roadmap.service.js';
import userProgressService from './userProgress.service.js';
import roadmapRepository from './roadmap.repository.js';
import { ApiResponse } from '../../shared/utils/ApiResponse.js';

export const createRoadmap = async (req, res) => res.status(201).json(new ApiResponse(201, { id: await roadmapService.createRoadmap(req.body.roadmapId, req.body.title) }, "Created"));
export const addItem = async (req, res) => res.status(201).json(new ApiResponse(201, { id: await roadmapService.addItem(req.params.roadmapId, req.body) }, "Added"));
export const updateItem = async (req, res) => res.status(200).json(new ApiResponse(200, await roadmapService.updateItem(req.params.roadmapId, req.params.itemId, req.body), "Updated"));
export const deleteItem = async (req, res) => res.status(200).json(new ApiResponse(200, await roadmapService.deleteItem(req.params.roadmapId, req.params.itemId, req.body.type, req.body.parentId), "Deleted"));

export const getAllRoadmaps = async (req, res) => res.status(200).json(new ApiResponse(200, await roadmapRepository.findAllTemplates(), "Fetched"));
export const getRoadmapData = async (req, res) => res.status(200).json(new ApiResponse(200, await userProgressService.getRoadmapData(req.userId, req.params.roadmapId), "Fetched"));
export const toggleSolvedStatus = async (req, res) => res.status(200).json(new ApiResponse(200, await userProgressService.toggleSolved(req.userId, req.params.roadmapId, req.body.questionId, req.body.difficulty), "Updated"));
export const toggleBookmark = async (req, res) => res.status(200).json(new ApiResponse(200, { isBookmarked: await userProgressService.toggleBookmark(req.userId, req.params.roadmapId, req.body.questionId) }, "Toggled"));
export const saveNote = async (req, res) => res.status(200).json(new ApiResponse(200, await userProgressService.saveNote(req.userId, req.params.roadmapId, req.body.questionId, req.body.noteText), "Saved"));