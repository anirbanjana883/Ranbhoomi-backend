import express from "express";
import isAuth from "../middleware/isAuth.js";
import {
  getCurrentUser,
  getSolvedProblems,
  getUserProfile,
  updateProfile,
} from "../controller/userController.js";
import upload from "../middleware/multer.js";

const userRouter = express.Router();

userRouter.get("/getcurrentuser", isAuth, getCurrentUser);
userRouter.get("/profile", isAuth, getUserProfile);
userRouter.get("/profile/:username", getUserProfile);
userRouter.put("/updateprofile", isAuth, upload.single("photoUrl"), updateProfile);
userRouter.get('/solved', isAuth, getSolvedProblems);

export default userRouter;
