import dotenv from "dotenv";
import mongoose from "mongoose"; // 🚀 Imported for graceful shutdown
import connectDb from "./config/connectDB.js";
import { initDispatchWorker } from "./worker/dispatchWorker.js"; 
import { initPollingWorker } from "./worker/pollingWorker.js";   
import { initContestPollingWorker } from "./worker/contestPollingWorker.js";
import { initContestDispatchWorker } from "./worker/contestDispatchWorker.js";
// import { initPaymentWorker } from "./worker/paymentWorker.js";

dotenv.config();

let workers = [];

const startWorkerNode = async () => {
    try {
        console.log(" Booting up Worker Node...");
        await connectDb(); 
        console.log(" Worker Node connected to Database");
        
        //  Push the returned worker instances into our array
        workers.push(initDispatchWorker());
        workers.push(initPollingWorker());
        workers.push(initContestDispatchWorker());
        workers.push(initContestPollingWorker());

        // workers.push(initPaymentWorker());
        
        console.log(" All workers started and listening for jobs.");
    } catch (error) {
        console.error(" Failed to start worker node:", error);
        process.exit(1);
    }
};

//  WORKER NODE GRACEFUL SHUTDOWN
const shutdownGracefully = async (signal) => {
    console.log(`\n Received ${signal}. Shutting down Worker Node gracefully...`);

    // Safely pause all BullMQ Workers (Let them finish their current job)
    console.log(" Waiting for BullMQ workers to finish active code executions...");
    await Promise.all(workers.map(worker => worker && worker.close()));
    console.log("All BullMQ workers safely shut down. No zombie jobs left behind.");

    // Close Database Connection safely
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log("MongoDB connection closed.");
    }

    console.log(" Worker Node shutdown complete. Goodbye!");
    process.exit(0);
};

process.on("SIGINT", () => shutdownGracefully("SIGINT"));   
process.on("SIGTERM", () => shutdownGracefully("SIGTERM")); 

startWorkerNode();