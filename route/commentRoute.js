import express from "express";
import { getComments, addComment, deleteComment } from "../controller/commentController.js";
import isAuth from "../middleware/isAuth.js";

const commentRouter = express.Router();

commentRouter.get("/:slug", isAuth, getComments); 
commentRouter.post("/:slug", isAuth, addComment); 
commentRouter.delete("/:id", isAuth, deleteComment); 

export default commentRouter;