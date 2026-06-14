const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

let io;

function getAllowedOrigins() {
  return String(process.env.SOCKET_CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createNotification(payload) {
  return {
    id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: payload.type || "info",
    title: payload.title || "Notification",
    message: payload.message || "",
    data: payload.data || {},
    createdAt: payload.createdAt || new Date().toISOString(),
    read: false,
  };
}

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Missing auth token."));

    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch {
      return next(new Error("Invalid auth token."));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.user.id}`);
    socket.emit("notification:ready", { ok: true });
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return false;
  io.to(`user:${userId}`).emit(event, payload);
  return true;
}

function emitNotification(userId, payload) {
  return emitToUser(userId, "notification:new", createNotification(payload));
}

module.exports = { initSocket, emitToUser, emitNotification };
