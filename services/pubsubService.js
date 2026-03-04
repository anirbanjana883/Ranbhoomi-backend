import queueConnection from "../config/queue.js"; // IOREDIS TCP CLIENT

export const setupRedisSubscriber = (io) => {
    const subscriber = queueConnection.duplicate();
    
    subscriber.subscribe("submission-events", (err) => {
        if (err) console.error("Failed to subscribe to submission events", err);
        else console.log("📡 Subscribed to Worker Submission Events");
    });

    subscriber.on("message", (channel, message) => {
        if (channel === "submission-events") {
            const result = JSON.parse(message);
            io.to(result.userId).emit("submission-result", result);
        }
    });
};