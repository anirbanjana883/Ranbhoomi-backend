import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

let redis;

if (process.env.REDIS_URL) {
  // Docker Production Mode
  console.log("🔌 Connecting to Redis via URL...");
  redis = new Redis(process.env.REDIS_URL);
} else {
  // Local Development Mode
  console.log(" Connecting to Redis via Localhost...");
  redis = new Redis({
    host: "localhost",
    port: 6379,
  });
}

redis.on("connect", () => {
  console.log(" Redis connected successfully!");
});

redis.on("error", (err) => {
  console.error(" Redis connection error:", err);
});

export default redis;