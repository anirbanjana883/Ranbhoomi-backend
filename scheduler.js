import connectDb from "./config/connectDB.js";
import { initCronJobs } from "./jobs/cornJobs.js";

const startScheduler = async () => {
    console.log("Starting isolated Clock Process...");
    
    // 1. Connect to MongoDB (needed for the finalizer functions)
    await connectDb();
    
    // 2. Start the Cron Jobs
    initCronJobs();
    
    console.log("🕰️ Clock Process running and waiting for scheduled tasks...");
};

startScheduler();