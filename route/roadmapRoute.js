import { Router } from 'express';
import isAuth from '../middleware/isAuth.js'; 
import { 
    getRoadmapData, 
    toggleSolvedStatus, 
    toggleBookmark, 
    saveNote, 
    getAllRoadmaps
} from '../controller/roadmapController.js';

const roadmapRouter = Router();

roadmapRouter.use(isAuth);

roadmapRouter.get("/", getAllRoadmaps);

roadmapRouter.get("/:roadmapId", getRoadmapData);

roadmapRouter.patch("/:roadmapId/progress/status", toggleSolvedStatus);

roadmapRouter.patch("/:roadmapId/progress/bookmark", toggleBookmark);

roadmapRouter.patch("/:roadmapId/progress/note", saveNote);

export default roadmapRouter;