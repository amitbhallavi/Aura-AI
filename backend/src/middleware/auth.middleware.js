// ============================================================
// JWT Auth Middleware — protects private routes
// ============================================================
const jwt = require("jsonwebtoken");

/**
 * Attach this middleware to any route that requires login.
 * It checks the "Authorization: Bearer <token>" header,
 * verifies the JWT, and attaches the user payload to req.user.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // Check header exists and starts with "Bearer "
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided. Please login." });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify token signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please login again." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
}

module.exports = authMiddleware;
