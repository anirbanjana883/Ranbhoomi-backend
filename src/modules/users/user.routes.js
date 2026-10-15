import express from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { isAuth, isMaster } from "../../shared/middlewares/auth.middleware.js";
import { upload } from "../../shared/middlewares/upload.middleware.js";
import {
  getCurrentUser, getUserProfile, updateProfile, 
  requestAdmin, listPendingRequests, approveRequest, rejectRequest, getAllUsers, updateUserRole
} from "./user.controller.js";

const router = express.Router();

router.get("/current", isAuth, asyncHandler(getCurrentUser));
router.get("/profile", isAuth, asyncHandler(getUserProfile));
router.get("/profile/:username", asyncHandler(getUserProfile));
router.put("/profile", isAuth, upload.single("photoUrl"), asyncHandler(updateProfile));

router.post("/admin-request", isAuth, asyncHandler(requestAdmin));
router.get("/admin-request/pending", isAuth, isMaster, asyncHandler(listPendingRequests));
router.patch("/admin-request/approve/:requestId", isAuth, isMaster, asyncHandler(approveRequest));
router.patch("/admin-request/reject/:requestId", isAuth, isMaster, asyncHandler(rejectRequest));

router.get("/", isAuth, isMaster, asyncHandler(getAllUsers));
router.patch("/role/:userId", isAuth, isMaster, asyncHandler(updateUserRole));

export default router;