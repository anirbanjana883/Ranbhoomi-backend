import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || {
  host: "localhost",
  port: 6379,
});

// --- STANDARD LIMITER 10 second for normal practice question  ---
export const rateLimiter = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const key = `rate_limit:submission:${userId}`; 
    const exists = await redis.get(key);

    if (exists) {
      const ttl = await redis.ttl(key);
      return res.status(429).json({
        message: `Whoa! Slow down. Please wait ${ttl} seconds.`,
      });
    }

    await redis.set(key, "1", "EX", 10); 
    next();
  } catch (error) {
    console.error("Rate Limiter Error:", error);
    next();
  }
};

// --- CONTEST LIMITER 5 second for contest problem ---
export const contestRateLimiter = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const key = `rate_limit:contest:${userId}`; 
    const exists = await redis.get(key);

    if (exists) {
      const ttl = await redis.ttl(key);
      return res.status(429).json({
        message: `Contest Anti-Spam: Wait ${ttl}s before retrying.`,
      });
    }

    await redis.set(key, "1", "EX", 5); 
    next();
  } catch (error) {
    console.error("Contest Limiter Error:", error);
    next();
  }
};