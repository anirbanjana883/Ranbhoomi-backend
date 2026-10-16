import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import paymentRepository from "./payment.repository.js";
import userRepository from "../users/user.repository.js";
import { PLANS } from "../../shared/utils/constants.js";
import { ApiError } from "../../shared/utils/ApiError.js";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

class PaymentService {
    async createOrder(userId, planType) {
        if (!PLANS[planType] || planType === "Free") {
            throw new ApiError(400, "Invalid plan selected");
        }

        const user = await userRepository.findById(userId);
        if (!user) throw new ApiError(404, "User not found");

        if (user.subscriptionPlan === planType && user.subscriptionExpiresAt > new Date()) {
            throw new ApiError(400, `You already have an active ${planType} subscription`);
        }

        const planDetails = PLANS[planType];

        const newTransaction = await paymentRepository.createTransaction({
            userId, planType, amount: planDetails.price, status: "Pending"
        });

        const options = {
            amount: planDetails.price * 100, 
            currency: "INR",
            receipt: newTransaction._id.toString(),
            notes: { project: "Ranbhoomi", planType, userId: userId.toString() },
        };

        const order = await razorpay.orders.create(options);
        await paymentRepository.updateTransaction(newTransaction.orderId || newTransaction._id.toString(), { orderId: order.id });

        return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID };
    }

    async verifyPaymentFastAck(orderId, paymentId, signature) {
        const body = orderId + "|" + paymentId;
        const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");

        if (expectedSignature !== signature) {
            throw new ApiError(400, "Payment verification failed. Invalid Signature.");
        }

        const transaction = await paymentRepository.findByOrderId(orderId);
        if (!transaction) throw new ApiError(404, "Transaction not found");

        if (transaction.status === "Pending") {
            await paymentRepository.updateTransaction(orderId, { status: "Verifying", paymentId });
        }

        return true;
    }

    async processWebhook(bodyBuffer, signature) {
        const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(bodyBuffer).digest("hex");
        if (expectedSignature !== signature) throw new ApiError(400, "Invalid Webhook Signature");

        const payload = JSON.parse(bodyBuffer.toString());
        if (payload.event !== "payment.captured") return;

        const payment = payload.payload.payment.entity;
        if (payment.notes?.project !== "Ranbhoomi") return;

        const { order_id: orderId, id: paymentId, notes } = payment;
        const { planType, userId } = notes;

        const transaction = await paymentRepository.findByOrderId(orderId);
        if (!transaction || transaction.status === "Success") return;

        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
            const user = await userRepository.findById(userId);
            if (!user) throw new ApiError(404, "User not found");

            user.subscriptionPlan = planType;
            user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); 
            await userRepository.save(user);

            await paymentRepository.updateTransaction(orderId, { status: "Success", paymentId }, session);
        });
        session.endSession();
    }
}

export default new PaymentService();