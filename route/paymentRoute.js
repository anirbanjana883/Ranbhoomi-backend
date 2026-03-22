import express from "express";
import isAuth from "../middleware/isAuth.js";
import { createOrder, verifyPayment } from "../controller/paymentController.js";
import { razorpayWebhook } from "../controller/webhookController.js"; 

const paymentRouter = express.Router();

//  User clicks "Pay"
paymentRouter.post("/create-order", isAuth, createOrder);

//  Client acknowledges payment (Sets status to VERIFYING)
paymentRouter.post("/verify-payment", isAuth, verifyPayment);

export default paymentRouter;