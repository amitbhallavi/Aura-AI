const rateLimit = require("express-rate-limit");

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRetryAfterSeconds(req) {
  const resetTime = req.rateLimit?.resetTime;
  if (!resetTime) return null;
  return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
}

function rateLimitHandler(req, res, next, options) {
  const retryAfter = getRetryAfterSeconds(req);
  if (retryAfter) res.set("Retry-After", String(retryAfter));

  return res.status(options.statusCode || 429).json({
    code: "rate_limited",
    error: "Too many requests. Please wait and try again.",
    retryAfter,
  });
}

function createRateLimiter({ windowMs, max } = {}) {
  return rateLimit({
    windowMs: readPositiveInt(windowMs, readPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)),
    max: readPositiveInt(max, 100),
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  });
}

module.exports = {
  createRateLimiter,
  readPositiveInt,
};
