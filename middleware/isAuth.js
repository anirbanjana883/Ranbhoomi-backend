import jwt from "jsonwebtoken";

const isAuth = (req, res, next) => {
  try {

    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.userId) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error("isAuth Middleware Error:", error.message);
    return res.status(401).json({ message: "Authentication failed" });
  }
};

export default isAuth;
