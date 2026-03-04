import redisClient from "../config/redis.js"; 

// --- STANDARD LIMITER: 10 seconds for normal practice ---
export const rateLimiter = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const key = `rate_limit:submission:${userId}`; 
    
    //  Atomic Set-If-Not-Exists (NX)
    const isFirstRequest = await redisClient.set(key, "1", { nx: true, ex: 10 });

    if (!isFirstRequest) {
      const ttl = await redisClient.ttl(key); 
      const secondsLeft = ttl > 0 ? ttl : 10;
      
      return res.status(429).json({
        success: false,
        message: `Whoa! Slow down. Please wait ${secondsLeft} seconds.`,
      });
    }

    next();
  } catch (error) {
    console.error("Rate Limiter Error:", error.message);
    next(); 
  }
};

// --- CONTEST LIMITER: 5 seconds for contest problem ---
export const contestRateLimiter = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const key = `rate_limit:contest:${userId}`; 

    const isFirstRequest = await redisClient.set(key, "1", { nx: true, ex: 5 });

    if (!isFirstRequest) {
      const ttl = await redisClient.ttl(key);
      const secondsLeft = ttl > 0 ? ttl : 5;
      
      return res.status(429).json({
        success: false,
        message: `Contest Anti-Spam: Wait ${secondsLeft}s before retrying.`,
      });
    }

    next();
  } catch (error) {
    console.error("Contest Limiter Error:", error.message);
    next();
  }
};