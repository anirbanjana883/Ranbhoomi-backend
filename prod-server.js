import http from "http";
import dotenv from "dotenv";
import connectDb from "./config/connectDB.js";

//  API server
import app from "./app.js"; 

// Sockets & PubSub
import { initSockets } from "./sockets/socketManager.js";
import { setupRedisSubscriber } from "./services/pubsubService.js";

//  Workers
import { initDispatchWorker } from "./worker/dispatchWorker.js"; 
import { initPollingWorker } from "./worker/pollingWorker.js";   
import { initContestPollingWorker } from "./worker/contestPollingWorker.js";
import { initContestDispatchWorker } from "./worker/contestDispatchWorker.js";

//  Cron Jobs
import { initCronJobs } from "./jobs/cornJobs.js"; 

dotenv.config();

const PORT = process.env.PORT || 5000;

const bootMonolith = async () => {
    try {
        console.log("🚀 Booting up the Majestic Monolith...");
        
        // 1.  Single Shared Database Connection
        await connectDb(); 
        console.log("✅ Monolith connected to Database");
        
        // 2.  HTTP Server (Required for Socket.io)
        const httpServer = http.createServer(app);

        // 3.  Socket.io (System 1)
        const io = initSockets(httpServer);
        console.log("✅ WebSockets initialized.");

        // 4.  Redis PubSub (System 2)
        setupRedisSubscriber(io);
        console.log("✅ Redis PubSub connected.");

        // 5.  BullMQ Workers
        console.log("⚙️ Starting BullMQ Workers in the same process...");
        initDispatchWorker();
        initPollingWorker();
        initContestDispatchWorker();
        initContestPollingWorker();

        // 6.  Cron Scheduler
        console.log("🕰️ Starting Cron Scheduler...");
        initCronJobs();

        // 7.  Server Listening
        httpServer.listen(PORT, () => {
            console.log(`🌐 API & WebSockets listening on port ${PORT}`);
            console.log("🏆 All systems online. Ranbhoomi is fully operational.");
        });

    } catch (error) {
        console.error("❌ Failed to boot monolith:", error);
        process.exit(1);
    }
};

bootMonolith();