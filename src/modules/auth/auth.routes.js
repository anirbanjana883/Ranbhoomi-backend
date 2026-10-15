import express from "express";
import { googleAuth, logIn, logOut, resetPassword, sendOtp, signup, verifyOtp } from "./auth.controller.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";

const router = express.Router();

router.post("/signup", asyncHandler(signup));
router.post("/login", asyncHandler(logIn));
router.get("/logout", asyncHandler(logOut));
router.post("/sendotp", asyncHandler(sendOtp));
router.post("/verifyotp", asyncHandler(verifyOtp));
router.post("/resetpassword", asyncHandler(resetPassword));
router.post("/googleauth", asyncHandler(googleAuth));

export default router;