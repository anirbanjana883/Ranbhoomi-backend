import express from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { isAuth } from "../../shared/middlewares/auth.middleware.js";
import { createOrder, verifyPayment } from "./payment.controller.js";

const router = express.Router();

router.post("/create-order", isAuth, asyncHandler(createOrder));
router.post("/verify-payment", isAuth, asyncHandler(verifyPayment));

export default router;