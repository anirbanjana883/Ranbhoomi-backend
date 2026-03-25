import http from "http";
import dotenv from "dotenv";
import connectDb from "./config/connectDB.js";
import app from "./app.js";
import { initSockets } from "./sockets/socketManager.js";
import { setupRedisSubscriber } from "./services/pubsubService.js";
import { initCronJobs } from "./jobs/cornJobs.js";

dotenv.config();

const port = process.env.PORT || 5000;

let httpServer;
let io;

const startServer = async () => {
    try {
        //  Connect to Database
        await connectDb();

        //  Create HTTP Server - app.js
        httpServer = http.createServer(app);

        //  Initialize Socket.io (System 1: Run Code & Interview)
        io = initSockets(httpServer);

        //  Initialize Redis PubSub (System 2: Submit Code Listener)
        setupRedisSubscriber(io);

        //  Initialize Cron Jobs
        initCronJobs();

        //  Start Listening
        httpServer.listen(port, () => {
            console.log(`🚀 Server is running on port: ${port}`);
        });

    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};


// API SERVER GRACEFUL SHUTDOWN
const shutdownGracefully = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Shutting down API Server gracefully...`);

    if (httpServer) {
        httpServer.close(() => console.log("🔒 HTTP server closed (No new traffic)."));
    }
    if (io) {
        io.close(() => console.log("🔌 WebSockets disconnected."));
    }
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log("💾 MongoDB connection closed.");
    }

    console.log("👋 API Server shutdown complete. Goodbye!");
    process.exit(0);
};

process.on("SIGINT", () => shutdownGracefully("SIGINT"));   
process.on("SIGTERM", () => shutdownGracefully("SIGTERM")); 

startServer();
