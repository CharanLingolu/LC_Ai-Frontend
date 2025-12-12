// src/pages/JoinRoom.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRooms } from "../context/RoomContext";
import toast from "react-hot-toast";
// prefer direct socket import if your app exports it; fallback to window.socket
import { socket as importedSocket } from "../socket";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

const GUEST_ROOMS_KEY = "lc_ai_guest_rooms";
const USER_ROOMS_PREFIX = "lc_ai_user_rooms_";

function getUserRoomsKey(email) {
  return email ? USER_ROOMS_PREFIX + email : null;
}

export default function JoinRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { rooms, setRooms } = useRooms(); // get from context

  // Find room in local context (may be undefined if rooms not loaded yet)
  const room = rooms.find((r) => r.id === roomId);

  const [guestName, setGuestName] = useState("");
  const [loading, setLoading] = useState(false);

  // use whichever socket is present
  const socket = importedSocket || window?.socket;

  // Helper: safely replace/update a room in context (immutable)
  const upsertRoom = (updatedRoom) => {
    setRooms((prev) => {
      const exists = prev.some((r) => r.id === updatedRoom.id);
      if (exists) {
        return prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r));
      } else {
        return [...prev, updatedRoom];
      }
    });
  };

  // Save room into user/guest localStorage list (keeps rooms visible between refresh)
  const persistRoomForUser = (roomObj) => {
    try {
      if (isAuthenticated && user?.email) {
        const key = getUserRoomsKey(user.email);
        if (!key) return;
        const raw = localStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        const merged = Array.isArray(list)
          ? list.some((r) => String(r.id) === String(roomObj.id))
            ? list.map((r) =>
                String(r.id) === String(roomObj.id) ? roomObj : r
              )
            : [...list, roomObj]
          : [roomObj];
        localStorage.setItem(key, JSON.stringify(merged));
      } else {
        // guest
        const raw = localStorage.getItem(GUEST_ROOMS_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const merged = Array.isArray(list)
          ? list.some((r) => String(r.id) === String(roomObj.id))
            ? list.map((r) =>
                String(r.id) === String(roomObj.id) ? roomObj : r
              )
            : [...list, roomObj]
          : [roomObj];
        localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(merged));
      }
    } catch (e) {
      console.warn("persistRoomForUser error:", e);
    }
  };

  // When the component mounts, if the user is authenticated and the room exists locally,
  // attempt to join via backend so server has the membership recorded.
  useEffect(() => {
    // no-op if we don't have the room locally yet.
    if (!room) return;

    // If already a member, nothing to do
    if (isAuthenticated && user?.email) {
      const alreadyMember = Array.isArray(room.members)
        ? room.members.some(
            (m) =>
              String(m.id) === String(user.email) ||
              String(m.id) === String(user._id) ||
              String(m.id) === String(user.id)
          )
        : false;

      if (alreadyMember) return;

      // auto-join for authenticated users (non-interactive)
      (async () => {
        setLoading(true);
        try {
          const body = {
            code: room.code || roomId,
            userId: user._id || user.id || user.email,
            userName: user.name || user.email,
          };

          const joinUrl = `${BACKEND_URL || ""}/api/rooms/join`;
          const res = await fetch(joinUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          });

          // if backend responded OK, use returned room; otherwise fall back to optimistic update
          let updatedRoom;
          if (res.ok) {
            const json = await res.json();
            updatedRoom = {
              ...json,
              id:
                json.id ||
                json._id?.toString() ||
                String(json.code || room.code),
            };
          } else {
            // optimistic local update (backend failed to persist)
            updatedRoom = {
              ...room,
              members: [
                ...(room.members || []),
                {
                  id: user.email || user._id || user.id,
                  name: user.name || user.email,
                  role: "member",
                },
              ],
            };
          }

          // normalize id & persist to context and storage
          if (!updatedRoom.id) {
            updatedRoom.id =
              updatedRoom.id ||
              updatedRoom._id?.toString() ||
              String(updatedRoom.code || room.code);
          }

          upsertRoom(updatedRoom);
          persistRoomForUser(updatedRoom);

          // Prefer using the socket authenticated join to ensure the server
          // both persists membership and joins the socket to the room.
          try {
            if (socket && socket.emit) {
              socket.emit(
                "join_room_authenticated",
                {
                  code: room.code || roomId,
                  userId: user._id || user.id || user.email,
                  email: user.email || null,
                  userName: user.name || user.email,
                },
                (resp) => {
                  // server callback: if OK, it already joined socket to room
                  if (resp && resp.ok && resp.room) {
                    // use server room to update UI (most authoritative)
                    const serverRoom = {
                      ...resp.room,
                      id:
                        resp.room.id ||
                        resp.room._id?.toString() ||
                        String(resp.room.code || updatedRoom.code),
                    };
                    upsertRoom(serverRoom);
                    persistRoomForUser(serverRoom);
                  } else {
                    // fallback: ensure register_user + join_room are called
                    try {
                      socket.emit("register_user", {
                        userId: user._id || user.id,
                        email: user.email,
                      });
                      socket.emit("join_room", {
                        roomId: updatedRoom.id,
                        displayName: user.name || user.email,
                      });
                      socket.emit("request_room_list");
                    } catch (e) {}
                  }
                }
              );
            } else if (window?.socket) {
              window.socket.emit("join_room_authenticated", {
                code: room.code || roomId,
                userId: user._id || user.id || user.email,
                email: user.email || null,
                userName: user.name || user.email,
              });
              window.socket.emit("request_room_list");
            }
          } catch (sockErr) {
            console.warn("socket emit after auto-join failed:", sockErr);
            if (socket && socket.emit) {
              try {
                socket.emit("register_user", {
                  userId: user._id || user.id,
                  email: user.email,
                });
                socket.emit("join_room", {
                  roomId: updatedRoom.id,
                  displayName: user.name || user.email,
                });
                socket.emit("request_room_list");
              } catch {}
            }
          }

          toast.success(`Joined "${updatedRoom.name || room.name}"`, {
            duration: 2500,
          });

          navigate("/rooms");
        } catch (err) {
          console.error("JoinRoom join error:", err);
          // fallback: optimistic local join + socket + local persist
          const localUpdated = {
            ...room,
            members: [
              ...(room.members || []),
              {
                id: user.email || user._id || user.id,
                name: user.name || user.email,
                role: "member",
              },
            ],
          };
          upsertRoom(localUpdated);
          persistRoomForUser(localUpdated);

          try {
            if (socket && socket.emit) {
              socket.emit("register_user", {
                userId: user._id || user.id || user.email,
                email: user.email || null,
              });
              socket.emit("join_room", {
                roomId:
                  localUpdated.id || localUpdated._id || localUpdated.code,
                displayName: user.name || user.email || null,
              });
              socket.emit("request_room_list");
            } else if (window?.socket) {
              window.socket.emit("register_user", {
                userId: user._id || user.id || user.email,
                email: user.email || null,
              });
              window.socket.emit("join_room", {
                roomId:
                  localUpdated.id || localUpdated._id || localUpdated.code,
                displayName: user.name || user.email || null,
              });
              window.socket.emit("request_room_list");
            }
          } catch (e) {}

          toast.success(`Joined "${room.name}" (offline)`, { duration: 2500 });
          navigate("/rooms");
        } finally {
          setLoading(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, isAuthenticated, user]);

  // Guest join handler (click)
  const handleGuestJoin = async () => {
    if (!guestName.trim()) {
      toast.error("Please enter a name", { duration: 2200 });
      return;
    }
    if (!room) {
      toast.error("Room not found", { duration: 2200 });
      return;
    }

    setLoading(true);
    try {
      // generate guest id (persist it so guest session remains)
      let guestId = localStorage.getItem("lc_ai_guest_id");
      if (!guestId) {
        guestId = `guest_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        try {
          localStorage.setItem("lc_ai_guest_id", guestId);
        } catch (e) {}
      }
      try {
        localStorage.setItem("lc_ai_guest_name", guestName.trim());
      } catch (e) {}

      // Update local context (optimistic)
      const updatedRoom = {
        ...room,
        members: [
          ...(room.members || []),
          { id: guestId, name: guestName.trim(), role: "guest" },
        ],
      };
      upsertRoom(updatedRoom);
      persistRoomForUser(updatedRoom);

      // Notify backend via socket for guest join (server usually handles guest joins via socket)
      try {
        if (socket && socket.emit) {
          socket.emit("join_room_guest", {
            code: room.code || roomId,
            name: guestName.trim(),
            guestId,
          });
          // ensure socket has guest userId registered so server knows who this socket is
          socket.emit("register_user", { userId: guestId, email: null });
          socket.emit("request_room_list");
        } else if (window?.socket) {
          window.socket.emit("join_room_guest", {
            code: room.code || roomId,
            name: guestName.trim(),
            guestId,
          });
          window.socket.emit("register_user", { userId: guestId, email: null });
          window.socket.emit("request_room_list");
        }
      } catch (e) {
        console.warn("Socket join_room_guest failed", e);
      }

      toast.success(`Joining "${room.name}" as ${guestName.trim()}`, {
        duration: 2200,
      });
      navigate("/rooms");
    } catch (err) {
      console.error("Guest join failed:", err);
      toast.error("Failed to join as guest", { duration: 2200 });
    } finally {
      setLoading(false);
    }
  };

  // If room not found in context, show friendly message
  if (!room) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="p-6 border rounded-xl bg-white dark:bg-gray-800 text-center">
          <h2 className="text-lg font-semibold text-red-500">
            ❌ Room Not Found
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            This room link is invalid or the room list hasn't loaded yet.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={() => navigate("/rooms")}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Go Back
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded border text-sm"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Normal display UI (unchanged structure with names)
  return (
    <div className="flex items-center justify-center h-full">
      <div className="p-6 border rounded-xl bg-white dark:bg-gray-800 text-center w-80">
        <h2 className="text-xl font-semibold">{room.name}</h2>
        <p className="text-xs text-gray-500 mb-4">Room Code: {room.code}</p>

        {isAuthenticated ? (
          <>
            <p className="text-sm text-green-600">
              You are joining as {user.name} ✔
            </p>
            <button
              disabled={loading}
              className="mt-4 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => navigate("/rooms")}
            >
              {loading ? "Joining..." : "Continue"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-2">Join as a guest</p>
            <input
              placeholder="Enter your name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full px-3 py-2 border rounded mb-3 dark:bg-gray-900"
            />

            <button
              onClick={handleGuestJoin}
              disabled={loading}
              className="w-full px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
            >
              {loading ? "Joining..." : "Join Room"}
            </button>

            <p className="text-xs mt-3 text-gray-400">
              Want to save chat history?{" "}
              <span
                className="text-blue-500 cursor-pointer hover:underline"
                onClick={() => navigate("/login")}
              >
                Sign in
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
