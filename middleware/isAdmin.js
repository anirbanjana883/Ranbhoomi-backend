const isAdmin = (req, res, next) => {
  try {
    // Zero DB queries - roll is checked by the role attached by isAuth
    if (!req.userRole || (req.userRole !== "admin" && req.userRole !== "master")) {
      return res.status(403).json({ message: "Access denied. Admin or Master role required." });
    }
    next();
  } catch (error) {
    console.error("isAdmin Middleware Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

export default isAdmin;