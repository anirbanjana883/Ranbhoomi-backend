import { redisTCP } from "../../core/redis.js";

export const setupRedisSubscriber = (io) => {
    const subscriber = redisTCP.duplicate();
    subscriber.subscribe("submission-events", "leaderboard-events", (err) => {
        if (!err) console.log("[Redis] Unified Subscriber listening");
    });

    subscriber.on("message", (channel, message) => {
        try {
            const result = JSON.parse(message);
            if (channel === "submission-events") {
                if (result.roomID) io.to(result.roomID).emit("interview-execution-result", result);
                else if (result.userId) io.to(String(result.userId)).emit("submission-result", result);
            } else if (channel === "leaderboard-events") {
                if (result.contestId && result.userId) io.to(`contest_${result.contestId}`).emit("leaderboard-updated", { userId: result.userId, newScore: result.newScore });
            }
        } catch (e) {}
    });
};