// src/socket.js (or wherever you keep it)
import { io } from "socket.io-client";

/**
 * Resolve socket URL:
 * 1. Prefer VITE_SOCKET_URL if provided (set it in Vite/Vercel env)
 * 2. If not provided and page is https, attempt to use window.location.origin
 * 3. Fallback to localhost:5000 for local dev
 */
const envUrl = import.meta.env?.VITE_SOCKET_URL;
const FALLBACK = "http://localhost:5000";

function normalizeUrl(url) {
  if (!url) return url;
  // strip trailing slash
  return url.replace(/\/$/, "");
}

let SOCKET_URL =
  normalizeUrl(envUrl) ||
  (location.protocol === "https:" ? window.location.origin : FALLBACK);

// avoid mixed-content: if page is https but SOCKET_URL explicitly uses http, switch to https
if (location.protocol === "https:" && SOCKET_URL.startsWith("http://")) {
  SOCKET_URL = SOCKET_URL.replace(/^http:\/\//, "https://");
}

console.log("🔌 socket url →", SOCKET_URL);

export const socket = io(SOCKET_URL, {
  path: "/socket.io", // explicit path (helps behind some proxies)
  withCredentials: true,
  transports: ["websocket", "polling"], // try websocket first, fall back to polling
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  secure: location.protocol === "https:" || SOCKET_URL.startsWith("https://"),
  // increase timeout slightly so slow networks have time to upgrade
  timeout: 20000,
});

export function registerSocketUser(user) {
  socket.emit("register_user", {
    userId: user ? user.id : null,
    email: user ? user.email : null,
  });
}

socket.on("connect", () => {
  console.log("🟢 Socket connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("🔴 Socket disconnected:", reason);
});

socket.on("connect_error", (err) => {
  console.error("⚠️ Socket connect_error:", err.message || err);
  // Helpful hint for CORS / mixed-content:
  if (err && err.message && err.message.includes("xhr poll error")) {
    console.warn(
      "Possible CORS / websocket upgrade failure. Check server CORS config and ensure the socket URL/protocol (ws/wss) matches the page."
    );
  }
});

socket.on("connect_timeout", (timeout) => {
  console.warn("⚠️ Socket connection timed out:", timeout);
});
