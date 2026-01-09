import express from "express";
import { createPost, getPosts, addReply } from "../controller/communityController.js";
import isAuth from "../middleware/isAuth.js";

const communityRouter = express.Router();


communityRouter.get("/feed", getPosts);


communityRouter.post("/create", isAuth, createPost);
communityRouter.post("/:postId/reply", isAuth, addReply);

export default communityRouter;