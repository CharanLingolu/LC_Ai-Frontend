// src/socket.js
import { io } from "socket.io-client";

export const socket = io("http://localhost:5000", {
  withCredentials: true,
  transports: ["websocket"],
});

export function registerSocketUser(user) {
  socket.emit("register_user", {
    userId: user ? user.id : null, // Mongo _id from backend response
    email: user ? user.email : null,
  });
}
