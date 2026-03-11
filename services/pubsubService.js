import queueConnection from "../config/queue.js"; 

export const setupRedisSubscriber = (io) => {
    const subscriber = queueConnection.duplicate();
    
    subscriber.subscribe("submission-events", (err) => {
        if (err) console.error("Failed to subscribe to submission events", err);
        else console.log("Subscribed to Worker Submission Events");
    });

    // subscriber.on("message", (channel, message) => {
    //     if (channel === "submission-events") {
    //         const result = JSON.parse(message);
    //         io.to(result.userId).emit("submission-result", result);
    //     }
    // });

    subscriber.on("message", (channel, message) => {
        if (channel === "submission-events") {
            try {
                const result = JSON.parse(message);
                
                if (result.roomID) {
                    console.log(`Routing execution result to Interview Room: ${result.roomID}`);
                    // Emit to everyone in the room (Candidate + Interviewer)
                    io.to(result.roomID).emit("interview-execution-result", result);
                } 
                //  Standard submission fallback
                else if (result.userId) {
                    io.to(result.userId).emit("submission-result", result);
                }
            } catch (error) {
                console.error("Error parsing Redis PubSub message:", error);
            }
        }
    });
};