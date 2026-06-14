// ============================================================
// Redis Configuration — for sessions & rate limiting cache
// ============================================================
const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redis.on("connect", () => console.log("✅ Redis connected" + (redis.options.name ? ` to ${redis.options.host}:${redis.options.port}` : "")));
redis.on("error", (err) => console.error("❌ Redis error:", err.message));

module.exports = redis;
