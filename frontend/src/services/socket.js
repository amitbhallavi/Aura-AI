import { io } from "socket.io-client";

let socket;

function getSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;

  const apiUrl = import.meta.env.VITE_API_URL || "/api";
  if (apiUrl === "/api" && window.location.port === "5173") return "http://localhost:8080";

  const url = new URL(apiUrl, window.location.origin);
  url.pathname = url.pathname.replace(/\/api\/?$/, "");
  return `${url.origin}${url.pathname}`.replace(/\/$/, "");
}

export function connectNotificationSocket(token) {
  if (socket) socket.disconnect();

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ["websocket", "polling"],
    withCredentials: true,
  });

  return socket;
}

export function disconnectNotificationSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
