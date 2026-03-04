import http from "http";
import dotenv from "dotenv";
import connectDb from "./config/connectDB.js";
import app from "./app.js";
import { initSockets } from "./sockets/socketManager.js";
import { setupRedisSubscriber } from "./services/pubsubService.js";
import { initCronJobs } from "./jobs/cornJobs.js";

dotenv.config();

const port = 5000;

const startServer = async () => {
    try {
        //  Connect to Database
        await connectDb();

        //  Create HTTP Server - app.js
        const httpServer = http.createServer(app);

        //  Initialize Socket.io (System 1: Run Code & Interview)
        const io = initSockets(httpServer);

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

startServer();