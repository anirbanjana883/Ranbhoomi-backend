import http from "http";
import dotenv from "dotenv";
import connectDb from "./config/connectDB.js";
import mongoose from "mongoose";

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

// Keep references to global services so we can shut them down
let httpServer;
let io;
let workers = [];
let cronTasks = [];

const bootMonolith = async () => {
    try {
        console.log(" - Booting up the Majestic Monolith...");
        
        // 1.  Single Shared Database Connection
        await connectDb(); 
        console.log(" - Monolith connected to Database");
        
        // 2.  HTTP Server (Required for Socket.io)
        httpServer = http.createServer(app);

        // 3.  Socket.io (System 1)
        io = initSockets(httpServer);
        console.log(" - WebSockets initialized.");

        // 4.  Redis PubSub (System 2)
        setupRedisSubscriber(io);
        console.log(" - Redis PubSub connected.");

        // 5.  BullMQ Workers
        console.log(" - Starting BullMQ Workers in the same process...");

        // Push the returned worker instances into an array
        workers.push(initDispatchWorker());
        workers.push(initPollingWorker());
        workers.push(initContestDispatchWorker());
        workers.push(initContestPollingWorker());

        // 6.  Cron Scheduler
        console.log(" - Starting Cron Scheduler...");
        cronTasks = initCronJobs();

        // 7.  Server Listening
        httpServer.listen(PORT, () => {
            console.log(` - API & WebSockets listening on port ${PORT}`);
            console.log(" - All systems online. Ranbhoomi is fully operational.");
        });

    } catch (error) {
        console.error(" - Failed to boot monolith:", error);
        process.exit(1);
    }
};

// GRACEFUL SHUTDOWN HANDLER
const shutdownGracefully = async (signal) => {
    console.log(`\n - Received ${signal}. Initiating graceful shutdown...`);

    // 1. Stop taking new HTTP/Socket requests
    if (httpServer) {
        httpServer.close(() => console.log(" - HTTP server closed."));
    }
    if (io) {
        io.close(() => console.log(" - WebSockets disconnected."));
    }

    // 2. Stop Cron Jobs from firing new events
    if (cronTasks && cronTasks.length > 0) {
        cronTasks.forEach(task => task.stop());
        console.log(" - Cron Scheduler safely stopped.");
    }

    // 3. Safely pause all BullMQ Workers (Let them finish their current job)
    console.log(" - Waiting for BullMQ workers to finish active jobs...");
    await Promise.all(workers.map(worker => worker && worker.close()));
    console.log(" - All BullMQ workers safely shut down.");

    // 4. Close Database Connection safely
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log(" - MongoDB connection closed.");
    }

    console.log(" - Monolith shutdown complete. Goodbye!");
    process.exit(0);
};

// Listen for Render/Docker kill signals
process.on("SIGINT", () => shutdownGracefully("SIGINT"));   // Ctrl+C in terminal
process.on("SIGTERM", () => shutdownGracefully("SIGTERM")); // Render deployment kill signal

bootMonolith();