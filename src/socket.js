// src/socket.js
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export const socket = io(SOCKET_URL, {
  withCredentials: true,
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10, // Try reconnecting 10 times
  reconnectionDelay: 1000, // Wait 1 sec between retry attempts
});

export function registerSocketUser(user) {
  socket.emit("register_user", {
    userId: user ? user.id : null, // Mongo _id from backend response
    email: user ? user.email : null,
  });
}

socket.on("connect", () => {
  console.log("🟢 Socket connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("🔴 Socket disconnected:", reason);
});
