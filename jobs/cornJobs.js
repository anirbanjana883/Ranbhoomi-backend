import cron from "node-cron";
import redisClient from "../config/redis.js";
import { publishEndedContestProblems } from "../services/contestPublisher.js"; 
import { finalizeEndedContests } from "../services/contestFinalizer.js";

export const initCronJobs = () => {
    // Distributed Cron Job Safe-Guard
    cron.schedule("*/5 * * * *", async () => { 
        const lockKey = "cron:maintenance:lock";
        
        // Use standard ioredis syntax: "EX", seconds, "NX" 
        // (If using @upstash/redis, your { nx: true, ex: 60 } is correct!)
        //  const gotLock = await redisClient.set(lockKey, "1", { nx: true, ex: 60 });
        const gotLock = await redisClient.set(lockKey, "1", { nx: true, ex: 60 });
        
        if (gotLock) {
            console.log(" Scheduler: Acquired lock. Running contest maintenance tasks...");
            
            try {
                // Run independently so a failure in one doesn't block the other
                await publishEndedContestProblems().catch(err => {
                    console.error(" Scheduler: Error publishing problems:", err.message);
                });
                
                await finalizeEndedContests().catch(err => {
                    console.error(" Scheduler: Error finalizing contests:", err.message);
                });
                
                console.log(" Scheduler: Tasks completed successfully.");
            } catch (error) {
                console.error(" Scheduler: Fatal execution error:", error);
            }
            
            // We let the lock expire naturally after 60s to prevent rapid re-fires
        }
    });

    console.log("⏰ Cron Scheduler Initialized");
};