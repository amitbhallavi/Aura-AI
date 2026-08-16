const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env"), override: true });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { createRateLimiter, readPositiveInt } = require("./middleware/rateLimit.middleware");

const authRoutes = require("./routes/auth.routes");
const chatRoutes = require("./routes/chat.routes");
const callRoutes = require("./routes/call.routes");
const messageRoutes = require("./routes/message.routes");
const taskRoutes = require("./routes/task.routes");
const adminRoutes = require("./routes/admin.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const paymentRoutes = require("./routes/payment.routes");
const calendarRoutes = require("./routes/calendar.routes");
const googleRoutes = require("./routes/google.routes");
const aiRoutes = require("./routes/ai.routes");
const aiMessageRoutes = require("./routes/aiMessage.routes");
const mapsRoutes = require("./routes/maps.routes");
const gmailRoutes = require("./routes/gmail.routes");
const voiceRoutes = require("./routes/voice.routes");
const connectionRoutes = require("./routes/connection.routes");
const phoneConfigRoutes = require("./routes/phoneConfig.routes");
const callerIdRoutes = require("./routes/callerId.routes");
const webhookRoutes = require("./routes/webhook.routes");
const { initSocket } = require("./services/socket.service");
const { buildPhoneTwiml } = require("./services/phoneConfig.service");
const app = express();

const rateLimitWindowMs = readPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const generalLimiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: readPositiveInt(process.env.RATE_LIMIT_GENERAL_MAX, 600),
});
const authLimiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: readPositiveInt(process.env.RATE_LIMIT_AUTH_MAX, 60),
});
const aiLimiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: readPositiveInt(process.env.RATE_LIMIT_AI_MAX, 120),
});
const paymentLimiter = createRateLimiter({
  windowMs: rateLimitWindowMs,
  max: readPositiveInt(process.env.RATE_LIMIT_PAYMENT_MAX, 60),
});

// ============================================================
// Security Headers
// ============================================================
app.use(helmet());

// ============================================================
// CORS Configuration — only allow whitelisted origins
// ============================================================
const corsOrigins = process.env.CORS_ORIGINS?.split(",") || [];
const frontendUrl = process.env.FRONTEND_URLS || "http://localhost:5173";

// In development, allow localhost; in production, only allow specified origins
const allowedOrigins = process.env.NODE_ENV === "development" 
  ? ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"]
  : corsOrigins.length > 0 ? corsOrigins : [frontendUrl];

app.use(cors({ 
  origin: allowedOrigins, 
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Request Logging — log less in production
// ============================================================
const morganFormat = process.env.NODE_ENV === "production" ? "combined" : "dev";
app.use(morgan(morganFormat, {
  // Skip logging for health checks
  skip: (req) => req.path === "/health",
  // In production, don't log sensitive paths
  stream: process.env.NODE_ENV === "production" ? require("fs").createWriteStream("/dev/null") : undefined,
}));

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/ai/generate-message", aiLimiter, aiMessageRoutes);
app.use("/api/ai", aiLimiter, aiRoutes);
app.use("/api/chat", aiLimiter, chatRoutes);
app.use("/api/payments", paymentLimiter, paymentRoutes);

app.use("/api/calls", generalLimiter, callRoutes);
app.use("/api/messages", generalLimiter, messageRoutes);
app.use("/api/tasks", generalLimiter, taskRoutes);
app.use("/api/admin", generalLimiter, adminRoutes);
app.use("/api/dashboard", generalLimiter, dashboardRoutes);
app.use("/api/calendar", generalLimiter, calendarRoutes);
app.use("/api/google", generalLimiter, googleRoutes);
app.use("/api/maps", generalLimiter, mapsRoutes);
app.use("/api/gmail", generalLimiter, gmailRoutes);
app.use("/api/voice", generalLimiter, voiceRoutes);
app.use("/api/connections", generalLimiter, connectionRoutes);
app.use("/api/phone-config", generalLimiter, phoneConfigRoutes);
app.use("/api/caller-id", generalLimiter, callerIdRoutes);
app.use("/api/webhooks", generalLimiter, webhookRoutes);

app.get('/', (req, res) => {
  res.json({
    status: 'AURA AI Backend is running ✅',
    health: '/health',
    docs: 'https://aura-ai-m710.onrender.com/health'
  });
});

app.get("/twiml", (req, res) => {
  res.type("text/xml");
  res.send(buildPhoneTwiml(req.query.message));
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "AURA Backend", version: "1.0.0" });
});

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  // Don't log stack trace in production
  if (process.env.NODE_ENV === "development") {
    console.error("Error:", err.stack);
  } else {
    console.error("Error:", { 
      message: err.message, 
      code: err.code,
      status: err.statusCode || err.status 
    });
  }

  // Don't expose error details in production
  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === "development" 
    ? err.message 
    : "Internal server error";

  res.status(statusCode).json({ error: message });
});

const PORT = process.env.PORT || 8080;

async function start() {
  if (process.env.PG_HOST) {
    try {
      const { connectPostgres } = require("./config/database");
      await connectPostgres();
    } catch (err) {
      console.warn("⚠️  PostgreSQL not connected:", err.message);
    }
  } else {
    console.warn("⚠️  PostgreSQL skipped — PG_HOST not set in .env");
  }

  if (process.env.MONGO_URI) {
    try {
      const { connectMongo } = require("./config/database");
      await connectMongo();
    } catch (err) {
      console.warn("⚠️  MongoDB not connected:", err.message);
    }
  } else {
    console.warn("⚠️  MongoDB skipped — MONGO_URI not set in .env");
  }

  if (process.env.PG_HOST) {
    try {
      require("./services/scheduler.service");
    } catch (err) {
      console.warn("⚠️  Scheduler not started:", err.message);
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`\n🚀 AURA Backend running on http://localhost:${PORT}`);
    console.log(`📋 Health: http://localhost:${PORT}/health\n`);
  });

  initSocket(server);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nPort ${PORT} is already in use.`);
      console.error(`Find the process: lsof -iTCP:${PORT} -sTCP:LISTEN -n -P`);
      console.error("Stop it with: kill PID_NUMBER_FROM_LOSOF");
      process.exit(1);
    }

    throw err;
  });
}

start();
