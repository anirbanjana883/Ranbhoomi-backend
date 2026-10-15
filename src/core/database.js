import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        // LOGIC CHANGE: Added maxPoolSize for high-concurrency (100k users) to prevent connection bottlenecks
        await mongoose.connect(process.env.MONGODB_URL, {
            maxPoolSize: 100, 
            serverSelectionTimeoutMS: 5000,
        });
        console.log("DB connected successfully");
    } catch (error) {
        console.error("DB Connection Error:", error);
        process.exit(1);
    }
};