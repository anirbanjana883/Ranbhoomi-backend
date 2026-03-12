import { Router } from 'express';
import isAuth from '../middleware/isAuth.js'; 
import isAdmin from '../middleware/isAdmin.js'; 
import { 
    addItem, 
    updateItem, 
    deleteItem ,
    createRoadmap
} from '../controller/roadmapAdminController.js';

const roadmapAdminRouter = Router();

roadmapAdminRouter.use(isAuth, isAdmin);

roadmapAdminRouter.post("/", createRoadmap);

roadmapAdminRouter.post("/:roadmapId/items", addItem);

roadmapAdminRouter.patch("/:roadmapId/items/:itemId", updateItem);

roadmapAdminRouter.delete("/:roadmapId/items/:itemId", deleteItem);

export default roadmapAdminRouter;