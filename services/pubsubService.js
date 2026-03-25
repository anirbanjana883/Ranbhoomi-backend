import queueConnection from "../config/queue.js"; 

export const setupRedisSubscriber = (io) => {
    // 1. Create EXACTLY ONE subscriber connection for the entire app
    const subscriber = queueConnection.duplicate();
    
    // 2. Subscribe to ALL required channels here
    subscriber.subscribe("submission-events", "leaderboard-events", (err) => {
        if (err) {
            console.error("[Redis] Failed to subscribe to events:", err);
        } else {
            console.log("[Redis] Unified Subscriber listening to Worker Events");
        }
    });

    // 3. Centralized Message Router
    subscriber.on("message", (channel, message) => {
        try {
            const result = JSON.parse(message);

            switch (channel) {
                // --- EXECUTION & SUBMISSION EVENTS ---
                case "submission-events":
                    if (result.roomID) {
                        // ⚔️ Interview Mode: Broadcast to both Interviewer and Candidate
                        console.log(`[PubSub] Routing execution to Interview Room: ${result.roomID}`);
                        io.to(result.roomID).emit("interview-execution-result", result);
                    } 
                    else if (result.userId) {
                        // 👤 Solo Mode: Send only to the specific user
                        io.to(String(result.userId)).emit("submission-result", result);
                    }
                    break;

                // --- CONTEST LEADERBOARD EVENTS ---
                case "leaderboard-events":
                    if (result.contestId && result.userId) {
                        // 🏆 Broadcast score updates to everyone viewing that specific contest
                        io.to(`contest_${result.contestId}`).emit("leaderboard-updated", {
                            userId: result.userId,
                            newScore: result.newScore,
                        });
                    }
                    break;

                default:
                    console.warn(`[PubSub] Unhandled channel: ${channel}`);
            }
        } catch (error) {
            console.error("[PubSub] Error parsing Redis message:", error);
        }
    });
};