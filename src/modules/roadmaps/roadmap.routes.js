import express from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { isAuth, isAdmin } from '../../shared/middlewares/auth.middleware.js';
import { createRoadmap, addItem, updateItem, deleteItem, getAllRoadmaps, getRoadmapData, toggleSolvedStatus, toggleBookmark, saveNote } from './roadmap.controller.js';

const router = express.Router();

// Public / User Routes
router.get('/', asyncHandler(getAllRoadmaps));
router.get('/:roadmapId', isAuth, asyncHandler(getRoadmapData));
router.patch('/:roadmapId/solved', isAuth, asyncHandler(toggleSolvedStatus));
router.patch('/:roadmapId/bookmark', isAuth, asyncHandler(toggleBookmark));
router.patch('/:roadmapId/note', isAuth, asyncHandler(saveNote));

// Admin Routes
router.post('/admin', isAuth, isAdmin, asyncHandler(createRoadmap));
router.post('/admin/:roadmapId/items', isAuth, isAdmin, asyncHandler(addItem));
router.put('/admin/:roadmapId/items/:itemId', isAuth, isAdmin, asyncHandler(updateItem));
router.delete('/admin/:roadmapId/items/:itemId', isAuth, isAdmin, asyncHandler(deleteItem));

export default router;