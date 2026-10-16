import ephemeralService from "./ephemeral.service.js";
import { redisCache } from "../../core/redis.js";

export const registerExecutionHandlers = (io, socket) => {
    socket.on("run_code", async (payload) => {
        const { slug, language, code, roomID } = payload;
        const userId = socket.userId || socket.user?.id; 

        const broadcastEvent = (eventName, data) => {
            socket.emit(eventName, data); 
            if (roomID) socket.to(roomID).emit(eventName, data); 
        };

        try {
            const rateKey = `rate:run:${userId}`;
            const runCount = await redisCache.incr(rateKey);
            if (runCount === 1) await redisCache.expire(rateKey, 60);
            if (runCount > 2) return broadcastEvent("run_error", { message: "🤚Slow down! You are running code too fast." });

            broadcastEvent("run_status", { status: "Fetching Test Cases..." });

            const { tokens, evalData } = await ephemeralService.executeCode(slug, language, code);

            broadcastEvent("run_status", { status: "Compiling and Executing..." });

            const results = await ephemeralService.pollExecution(tokens, socket);
            const formattedResults = ephemeralService.formatResults(results, evalData);

            broadcastEvent("run_result", {
                status: formattedResults.every((r) => r.status === "Passed") ? "Accepted" : "Failed",
                results: formattedResults,
            });

        } catch (error) {
            console.error("Run Code Error:", error);
            broadcastEvent("run_error", { message: error.message || "Failed to execute code." });
        }
    });
};