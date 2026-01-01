import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../models/userModel.js";
import { PLANS } from "../config/plans.js";
import dotenv from "dotenv";

dotenv.config();

//  Create Order (User clicks "Buy")
export const createOrder = async (req, res) => {
  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const { planType } = req.body;
    const userId = req.userId;

    if (!PLANS[planType] || planType === "Free") {
      return res.status(400).json({ message: "Invalid plan selected" });
    }

    const planDetails = PLANS[planType];

    const shortReceiptId = `rcpt_${Date.now()}_${userId.slice(-6)}`;

    const options = {
      amount: planDetails.price,
      currency: "INR",
      receipt: shortReceiptId,
      notes: {
        planType: planType,
        projectName: "Ranbhoomi", // this to filter ranbhoomi payment in my razorpy dashboeard
        userId: userId,
      },
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planType: planType,
    });
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
};

// 2. Verify Payment (Called after user pays)
export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planType,
    } = req.body;

    const userId = req.userId;

    // --- CRYPTOGRAPHIC SECURITY CHECK ---
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      // Calculate Expiry (30 Days from today)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);

      // Update User in Database
      await User.findByIdAndUpdate(userId, {
        subscriptionPlan: planType,
        subscriptionExpiresAt: expiryDate,
      });

      return res.status(200).json({
        success: true,
        message: `Welcome to the ${planType} Arena!`,
      });
    } else {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid Signature. Payment failed.",
        });
    }
  } catch (error) {
    console.error("Verify Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
