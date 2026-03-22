import Razorpay from "razorpay";
import crypto from "crypto";
// import mongoose from "mongoose";
import User from "../models/userModel.js";
import Transaction from "../models/transactionModel.js";
import { PLANS } from "../config/plans.js";
// import { paymentMailQueue } from "../config/queue.js"; 
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

//  CREATE ORDER 
export const createOrder = asyncHandler(async (req, res) => {
    const { planType } = req.body;
    const userId = req.userId;

    if (!PLANS[planType] || planType === "Free") {
        throw new ApiError(400, "Invalid plan selected");
    }

    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");

    // Pre-Enrollment Check
    if (user.subscriptionPlan === planType && user.subscriptionExpiresAt > new Date()) {
        throw new ApiError(400, `You already have an active ${planType} subscription`);
    }

    const planDetails = PLANS[planType];

    // Create  internal PENDING transaction first
    const newTransaction = await Transaction.create({
        userId,
        planType,
        amount: planDetails.price,
        status: "Pending"
    });

    // Create Razorpay Order
    const options = {
        amount: planDetails.price * 100, 
        currency: "INR",
        receipt: newTransaction._id.toString(),
        notes: {
            project: "Ranbhoomi",
            planType: planType,
            userId: userId
        },
    };

    const order = await razorpay.orders.create(options);

    // Update our transaction with the Razorpay Order ID
    newTransaction.orderId = order.id;
    await newTransaction.save();

    return res.status(200).json(
        new ApiResponse(200, {
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
        }, "Order created successfully")
    );
});

// VERIFY PAYMENT (The Fast Client ACK)
export const verifyPayment = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

    if (expectedSignature !== razorpay_signature) {
        throw new ApiError(400, "Payment verification failed. Invalid Signature.");
    }

    const transaction = await Transaction.findOne({ orderId: razorpay_order_id });
    if (!transaction) throw new ApiError(404, "Transaction not found");

    if (transaction.status === "Pending") {
        transaction.status = "Verifying"; 
        transaction.paymentId = razorpay_payment_id;
        await transaction.save();
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Payment acknowledged. Activating your subscription...")
    );
});