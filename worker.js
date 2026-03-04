import dotenv from "dotenv";
import connectDb from "./config/connectDB.js";
import { initDispatchWorker } from "./worker/dispatchWorker.js"; 
import { initPollingWorker } from "./worker/pollingWorker.js";   
// import { initPaymentWorker } from "./worker/paymentWorker.js";

dotenv.config();

const startWorkerNode = async () => {
    try {
        console.log("🚀 Booting up Worker Node...");
        
        await connectDb(); 
        console.log("✅ Worker Node connected to Database");
        
        //  Start the Decoupled BullMQ queue listeners
        initDispatchWorker();
        initPollingWorker();

        //  Other System Workers
        // initPaymentWorker();
        
    } catch (error) {
        console.error("❌ Failed to start worker node:", error);
        process.exit(1);
    }
};

startWorkerNode();