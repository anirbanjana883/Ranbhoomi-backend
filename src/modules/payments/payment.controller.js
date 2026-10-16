import paymentService from "./payment.service.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";

export const createOrder = async (req, res) => {
    const orderData = await paymentService.createOrder(req.userId, req.body.planType);
    res.status(200).json(new ApiResponse(200, orderData, "Order created successfully"));
};

export const verifyPayment = async (req, res) => {
    await paymentService.verifyPaymentFastAck(req.body.razorpay_order_id, req.body.razorpay_payment_id, req.body.razorpay_signature);
    res.status(200).json(new ApiResponse(200, {}, "Payment acknowledged. Activating your subscription..."));
};

export const razorpayWebhook = async (req, res) => {
    try {
        await paymentService.processWebhook(req.body, req.headers["x-razorpay-signature"]);
        res.status(200).send("Webhook processed");
    } catch (error) {
        console.error("Webhook processing error:", error);
        res.status(400).send("Webhook processing failed");
    }
};