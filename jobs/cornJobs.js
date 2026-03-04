// jobs/cronJobs.js
import cron from "node-cron";
import redisClient from "../config/redis.js";
import { publishEndedContestProblems } from "../services/contestPublisher.js";
import { finalizeEndedContests } from "../services/contestFinalizer.js";

export const initCronJobs = () => {
    // Distributed Cron Job Safe-Guard (Redis Lock)
    cron.schedule("*/5 * * * *", async () => { 
        const lockKey = "cron:maintenance:lock";
        const gotLock = await redisClient.set(lockKey, "1", { nx: true, ex: 60 });
        
        if (gotLock) {
            console.log("⚙️ Scheduler: Running contest maintenance tasks...");
            await publishEndedContestProblems();
            await finalizeEndedContests();
            console.log("✅ Scheduler: Tasks completed.");
        }
    });
};