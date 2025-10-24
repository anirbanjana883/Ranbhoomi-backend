import express from "express";
import isAuth from "../middleware/isAuth.js";
import {
  getCurrentUser,
  getUserProfile,
  updateProfile,
} from "../controller/userController.js";
import upload from "../middleware/multer.js";

const userRouter = express.Router();

userRouter.get("/getcurrentuser", isAuth, getCurrentUser);
userRouter.get("/profile/:username", getUserProfile);
userRouter.put("/updateprofile", isAuth, upload.single("photoUrl"), updateProfile);

export default userRouter;
