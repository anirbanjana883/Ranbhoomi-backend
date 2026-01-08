import User from "../models/userModel.js";

// plan features
export const PLANS = {
  Free: { aiLimit: 3 },
  Warrior: { aiLimit: 1000 },
  Gladiator: { aiLimit: 10000 },
};

export const checkAiLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });


    
    const today = new Date().toDateString();
    const lastUsed = new Date(user.aiUsage.lastUsed).toDateString();

    if (today !== lastUsed) {
      user.aiUsage.count = 0;
      user.aiUsage.lastUsed = new Date();
      await user.save();
    }

    
    const userPlan = PLANS[user.subscriptionPlan] || PLANS.Free;
    const limit = userPlan.aiLimit;

    
    if (user.aiUsage.count >= limit) {
      return res.status(403).json({
        message: `Daily limit reached for ${user.subscriptionPlan} plan.`,
        limitReached: true, 
        remaining: 0,
        upgradeRequired: true
      });
    }

    
    req.userFull = user;
    req.planLimit = limit;
    
    next();

  } catch (error) {
    console.error("Feature Gate Error:", error);
    res.status(500).json({ message: "Server error checking limits" });
  }
};