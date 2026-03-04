import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.UPSTASH_REDIS_URL;

// MUST have maxRetriesPerRequest: null for BullMQ to work properly
const connection = new IORedis(redisUrl || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  tls: redisUrl && redisUrl.startsWith("rediss://") ? {} : undefined, 
  connectTimeout: 15000, 
  keepAlive: 10000,
});

connection.on("error", (error) => {
    console.error("ioredis Connection Error:", error.message);
});

connection.on("connect", () => {
    console.log("ioredis (BullMQ TCP) connected successfully!");
});

//  Redis Memory Protection
const defaultQueueOptions = {
    connection,
    defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 1000 }, 
        removeOnFail: { age: 86400, count: 5000 }, 
    }
};

// ASYNCHRONOUS SUBMISSION ENGINE QUEUES

//  Dispatcher: Merges code and sends to Judge0
export const dispatchQueue = new Queue("dispatch-queue", defaultQueueOptions);

//  Poller: Asynchronously checks Judge0 status without blocking worker threads
export const pollingQueue = new Queue("polling-queue", defaultQueueOptions);

//  Leaderboard: Updates DB rankings (decoupled to prevent DB bottlenecks)
export const leaderboardQueue = new Queue("leaderboard-queue", defaultQueueOptions);


//  OTHER SYSTEM QUEUES

export const aiRetryQueue = new Queue("ai-retry-queue", { 
    connection,
    defaultJobOptions: { removeOnComplete: true } 
});

export const paymentMailQueue = new Queue("payment-mail-queue", { 
    connection,
    defaultJobOptions: { removeOnComplete: true } 
});

export default connection;