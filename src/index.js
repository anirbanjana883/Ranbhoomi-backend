import http from "http";
import dotenv from "dotenv";
import mongoose from "mongoose";
import app from "./server.js";
import { connectDB } from "./core/database.js";
// Modules to be implemented in future phases:
// import { initSockets } from "./shared/sockets/socketManager.js";
// import { setupRedisSubscriber } from "./modules/execution/pubsub.service.js";
// import { initWorkers } from "./modules/execution/workers.js";
// import { initCronJobs } from "./shared/jobs/cronJobs.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
let httpServer;

const bootMonolith = async () => {
    try {
        await connectDB();
        httpServer = http.createServer(app);
        
        // initSockets(httpServer);
        // setupRedisSubscriber(io);
        // initWorkers();
        // initCronJobs();

        httpServer.listen(PORT, () => {
            console.log(`🚀 API Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to boot monolith:", error);
        process.exit(1);
    }
};

const shutdownGracefully = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Shutting down safely...`);
    if (httpServer) httpServer.close(() => console.log("🔒 HTTP server closed."));
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log("💾 MongoDB connection closed.");
    }
    process.exit(0);
};

process.on("SIGINT", () => shutdownGracefully("SIGINT"));   
process.on("SIGTERM", () => shutdownGracefully("SIGTERM")); 

bootMonolith();