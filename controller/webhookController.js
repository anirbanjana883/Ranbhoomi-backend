import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/userModel.js";
import Transaction from "../models/transactionModel.js";
// import { paymentMailQueue } from "../config/queue.js";

export const razorpayWebhook = async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET; 

    try {
        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(req.body) 
            .digest("hex");

        if (expectedSignature !== signature) {
            console.error("🚨 Webhook Signature Mismatch!");
            return res.status(400).send("Invalid signature");
        }

        const payload = JSON.parse(req.body.toString());
        const event = payload.event;

        if (event === "payment.captured") {
            const payment = payload.payload.payment.entity;

            // Bouncer logic: Only process Ranbhoomi payments
            if (payment.notes?.project !== "Ranbhoomi") {
                return res.status(200).send("Ignored - Not Ranbhoomi"); 
            }

            const razorpayOrderId = payment.order_id;
            const transaction = await Transaction.findOne({ orderId: razorpayOrderId });
            
            if (!transaction) return res.status(200).send("Transaction not found"); 
            if (transaction.status === "Success") return res.status(200).send("Already processed");

            //  BEGIN ACID TRANSACTION 
            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                //  Calculate new expiry
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + 30); 

                //  Upgrade User
                await User.findByIdAndUpdate(
                    transaction.userId, 
                    { 
                        subscriptionPlan: transaction.planType,
                        subscriptionExpiresAt: expiryDate
                    },
                    { session }
                );

                //  Update Ledger
                transaction.status = "Success";
                transaction.paymentId = payment.id;
                await transaction.save({ session });

                //  Commit all changes atomically
                await session.commitTransaction();
                console.log(`🏆 Webhook successfully upgraded user: ${transaction.userId}`);

                // // 5. Fire and Forget Email Job (Outside the ACID transaction)
                // await paymentMailQueue.add("send-receipt", {
                //     userId: transaction.userId,
                //     planType: transaction.planType,
                //     amount: payment.amount / 100,
                //     paymentId: payment.id
                // });
                
            } catch (error) {
                await session.abortTransaction();
                console.error("Webhook Transaction Failed", error);
                return res.status(500).send("Server Error - Rolled back"); 
            } finally {
                session.endSession();
            }
        }

        return res.status(200).send("Webhook processed");

    } catch (error) {
        console.error("Webhook processing error:", error);
        return res.status(500).send("Internal Server Error");
    }
};