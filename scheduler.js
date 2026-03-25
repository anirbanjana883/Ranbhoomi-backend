import mongoose from "mongoose"; 
import connectDb from "./config/connectDB.js";
import { initCronJobs } from "./jobs/cornJobs.js"; 

let cronTasks = [];

const startScheduler = async () => {
    try {
        console.log("Starting isolated Clock Process...");
        
        // Connect to MongoDB 
        await connectDb();
        console.log("Clock Process connected to Database");
        
        // Start the Cron Jobs AND catch the returned array
        cronTasks = initCronJobs();
        
        console.log("Clock Process running and waiting for scheduled tasks...");
    } catch (error) {
        console.error("Failed to start Clock Process:", error);
        process.exit(1);
    }
};

// CLOCK PROCESS GRACEFUL SHUTDOWN
const shutdownGracefully = async (signal) => {
    console.log(`\nReceived ${signal}. Shutting down Clock Process gracefully...`);

    // Stop all scheduled cron jobs so they don't fire new events during shutdown
    if (cronTasks && cronTasks.length > 0) {
        cronTasks.forEach(task => task.stop());
        console.log("All Cron Jobs stopped.");
    }

    // Close Database Connection safely
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log("MongoDB connection closed.");
    }

    console.log("Clock Process shutdown complete. Goodbye!");
    process.exit(0);
};

// Listen for Render/Docker kill signals
process.on("SIGINT", () => shutdownGracefully("SIGINT"));   
process.on("SIGTERM", () => shutdownGracefully("SIGTERM")); 

startScheduler();