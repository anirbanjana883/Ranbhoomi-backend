import User from "../models/userModel.js";

const isMaster = async (req, res, next) => {
  try {
    // Zero DB queries - roll is checked by the role attached by isAuth
    if (!req.userRole || req.userRole !== "master") {
      return res.status(403).json({ message: "Access denied. Admin or Master role required." });
    }
    next();
  } catch (error) {
    console.error("isMaster Middleware Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default isMaster;
