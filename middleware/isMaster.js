import User from "../models/userModel.js";

const isMaster = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user || user.role !== "master") {
      return res.status(403).json({ message: "Access denied, master only" });
    }

    next();
  } catch (error) {
    console.error("isMaster Middleware Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default isMaster;
