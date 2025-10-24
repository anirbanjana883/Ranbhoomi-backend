import User from "../models/userModel.js"; 

const isAdmin = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const user = await User.findById(req.userId).select("role"); 

    if (!user || (user.role !== "admin" && user.role !== "master")) {
      return res.status(403).json({ message: "Access denied. Admin or Master role required." });
    }

    next();

  } catch (error) {
    console.error("isAdmin Middleware Error:", error);
    return res.status(500).json({ message: "Internal server error during authorization check." });
  }
};

export default isAdmin;