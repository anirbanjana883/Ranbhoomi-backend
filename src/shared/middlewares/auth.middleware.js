import jwt from "jsonwebtoken";
// Placeholder for Phase 2 implementation
import User from "../../modules/users/user.model.js";
import { PLANS } from "../utils/constants.js";

export const isAuth = (req, res, next) => {
    try {
        // LOGIC CHANGE: Added Bearer token fallback for API clients and edge cases
        const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
        if (!token) return res.status(401).json({ message: "User not authenticated" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || !decoded.userId) return res.status(403).json({ message: "Invalid or expired token" });

        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Authentication failed" });
    }
};

export const isAdmin = (req, res, next) => {
    if (!req.userRole || (req.userRole !== "admin" && req.userRole !== "master")) {
        return res.status(403).json({ message: "Access denied. Admin or Master role required." });
    }
    next();
};

export const isMaster = (req, res, next) => {
    if (!req.userRole || req.userRole !== "master") {
        return res.status(403).json({ message: "Access denied. Master role required." });
    }
    next();
};

export const isPremium = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId).select('subscriptionPlan subscriptionExpiresAt').lean();
        if (!user) return res.status(404).json({ message: "User not found." });

        if (user.subscriptionPlan === 'Free') {
            return res.status(403).json({ message: "Access Denied. You are on the Free plan." });
        }
        if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
            return res.status(403).json({ message: "Access Denied. Your premium subscription has expired." });
        }
        next();
    } catch (error) {
        return res.status(500).json({ message: "Server error checking premium status." });
    }
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

        const limit = (PLANS[user.subscriptionPlan] || PLANS.Free).aiLimit;
        if (user.aiUsage.count >= limit) {
            return res.status(403).json({
                message: `Daily limit reached for ${user.subscriptionPlan} plan.`,
                limitReached: true, remaining: 0, upgradeRequired: true
            });
        }

        req.userFull = user;
        req.planLimit = limit;
        next();
    } catch (error) {
        res.status(500).json({ message: "Server error checking limits" });
    }
};