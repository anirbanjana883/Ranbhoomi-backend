import cron from "node-cron";
import redisClient from "../config/redis.js";
import { publishEndedContestProblems } from "../services/contestPublisher.js"; 
import { finalizeEndedContests } from "../services/contestFinalizer.js";
import { applyGravityToHotPosts } from "../services/communityService.js"; 

export const initCronJobs = () => {
    
    //  CONTEST MAINTENANCE (Runs every 5 minutes)

    cron.schedule("*/5 * * * *", async () => { 
        const lockKey = "cron:maintenance:lock";
        const gotLock = await redisClient.set(lockKey, "1", { nx: true, ex: 60 });
        
        if (gotLock) {
            console.log("Scheduler: Acquired lock. Running contest maintenance tasks...");
            try {
                await publishEndedContestProblems().catch(err => {
                    console.error(" Scheduler: [!] Error publishing problems:", err.message);
                });
                
                await finalizeEndedContests().catch(err => {
                    console.error(" Scheduler: [!] Error finalizing contests:", err.message);
                });
                
                console.log("Scheduler: Contest tasks completed.");
            } catch (error) {
                console.error(" Scheduler: [!] Fatal execution error:", error);
            }
        }
    });

    //  COMMUNITY HOT SCORE DECAY (Runs every 10 minutes)

    cron.schedule("*/10 * * * *", async () => {
        const lockKey = "cron:hotscore:lock"; 
        const gotLock = await redisClient.set(lockKey, "1", { nx: true, ex: 60 });

        if (gotLock) {
            console.log("Scheduler: Acquired lock. Applying gravity to Community Posts...");
            try {
                await applyGravityToHotPosts().catch(err => {
                    console.error(" Scheduler: [!] Error applying gravity:", err.message);
                });
            } catch (error) {
                console.error(" Scheduler: [!] Fatal execution error in gravity decay:", error);
            }
        }
    });

    console.log("Cron Scheduler Initialized");
};