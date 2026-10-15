import { redisCache } from "../../core/redis.js";

const createLimiter = (prefix, limit, windowSeconds, msg) => async (req, res, next) => {
    try {
        if (!req.userId) return res.status(401).json({ message: "Unauthorized" });
        const key = `rate_limit:${prefix}:${req.userId}`;
        
        // LOGIC CHANGE: Unified and optimized counter logic using Upstash REST pipeline for speed
        const count = await redisCache.incr(key);
        if (count === 1) await redisCache.expire(key, windowSeconds);

        if (count > limit) {
            const ttl = await redisCache.ttl(key);
            return res.status(429).json({ success: false, message: msg.replace('{sec}', ttl > 0 ? ttl : windowSeconds) });
        }
        next();
    } catch (error) {
        next(); 
    }
};

export const rateLimiter = createLimiter("submission", 1, 10, "Whoa! Slow down. Please wait {sec} seconds.");
export const contestRateLimiter = createLimiter("contest", 1, 5, "Contest Anti-Spam: Wait {sec}s before retrying.");
export const communityPostLimiter = createLimiter("community_post", 5, 60, "Spam Protection: Post limit reached. Wait {sec}s.");
export const communityCommentLimiter = createLimiter("community_comment", 20, 60, "Spam Protection: Commenting too fast. Wait {sec}s.");