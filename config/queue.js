import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.UPSTASH_REDIS_URL;

const connection = new IORedis(redisUrl || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  tls: redisUrl && redisUrl.startsWith("rediss://") ? {} : undefined, 
  connectTimeout: 15000, 
  keepAlive: 10000,
});

connection.on("error", (error) => console.error("ioredis Error:", error.message));
connection.on("connect", () => console.log("ioredis connected successfully!"));

const defaultQueueOptions = {
    connection,
    defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 1000 }, 
        removeOnFail: { age: 86400, count: 5000 }, 
    }
};

// --- NORMAL PRACTICE QUEUES ---
// Dispatcher: Merges code and sends to Judge0
export const dispatchQueue = new Queue("dispatch-queue", defaultQueueOptions);
// Poller: Asynchronously checks Judge0 status
export const pollingQueue = new Queue("polling-queue", defaultQueueOptions);

// --- CONTEST QUEUES (Dedicated to prevent traffic jams) ---
// High-priority dispatcher for live contests
export const contestDispatchQueue = new Queue("contest-dispatch-queue", defaultQueueOptions);
// High-priority poller for live contests
export const contestPollingQueue = new Queue("contest-polling-queue", defaultQueueOptions);

// --- OTHER SYSTEM QUEUES ---
// export const interviewQueue = new Queue("interview-queue", { connection: redisConnection });

export const aiRetryQueue = new Queue("ai-retry-queue", { connection, defaultJobOptions: { removeOnComplete: true } });

export const paymentMailQueue = new Queue("payment-mail-queue", { connection, defaultJobOptions: { removeOnComplete: true } });

export default connection;