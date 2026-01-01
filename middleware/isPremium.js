import User from "../models/userModel.js";

const isPremium = async (req, res, next) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ message: "Unauthorized: User not identified." });
        }

        const user = await User.findById(req.userId).select('subscriptionPlan subscriptionExpiresAt');

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        if (user.subscriptionPlan === 'Free') {
            return res.status(403).json({ 
                message: "Access Denied. You are on the Free plan. Please upgrade to create private contests." 
            });
        }

        if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
            return res.status(403).json({ 
                message: "Access Denied. Your premium subscription has expired." 
            });
        }

        next();

    } catch (error) {
        console.error("Error in isPremium middleware:", error);
        return res.status(500).json({ message: "Server error checking premium status." });
    }
};

export default isPremium;