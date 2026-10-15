import { Redis } from "@upstash/redis";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// HTTP Client for standard caching (Serverless friendly)
export const redisCache = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// TCP Client for BullMQ and Pub/Sub
const redisUrl = process.env.UPSTASH_REDIS_URL || "redis://localhost:6379";
export const redisTCP = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    tls: redisUrl.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 15000,
    keepAlive: 10000,
});

redisTCP.on("error", (err) => console.error("IORedis Error:", err.message));
redisTCP.on("connect", () => console.log("IORedis connected successfully"));