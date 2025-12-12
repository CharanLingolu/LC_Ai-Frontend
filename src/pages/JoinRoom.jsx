// src/pages/JoinRoom.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRooms } from "../context/RoomContext";
import toast from "react-hot-toast";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export default function JoinRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { rooms, setRooms } = useRooms(); // get from context

  // Find room in local context (may be undefined if rooms not loaded yet)
  const room = rooms.find((r) => r.id === roomId);

  const [guestName, setGuestName] = useState("");
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    // no-op if we don't have the room locally yet.
    if (!room) return;

    // If already a member, nothing to do
    if (isAuthenticated && user?.email) {
      const alreadyMember = Array.isArray(room.members)
        ? room.members.some((m) => {
            const mid = m?.id ?? m?._id ?? m?.userId ?? m?.email;
            const uid = user?._id ?? user?.id ?? user?.email;
            return String(mid) === String(uid);
          })
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

          // Attempt backend POST to persist membership
          const joinUrl = `${BACKEND_URL || ""}/api/rooms/join`;
          const res = await fetch(joinUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          });

          if (res.ok) {
            // backend returned the updated room object
            const updatedRoom = await res.json();

            // normalize id if backend sends _id
            updatedRoom.id =
              updatedRoom.id ||
              updatedRoom._id?.toString() ||
              String(updatedRoom.code);

            // update context immutably
            upsertRoom(updatedRoom);

            // --- SAFE persist to localStorage: read-modify-write so we don't overwrite with stale "rooms" ---
            try {
              const storageKey = user?.email
                ? "lc_ai_user_rooms_" + user.email
                : "lc_ai_guest_rooms";

              const raw = localStorage.getItem(storageKey);
              const stored = raw ? JSON.parse(raw) : null;
              // Merge: prefer stored list, fallback to current context 'rooms' if stored is empty
              const baseList = Array.isArray(stored)
                ? stored
                : Array.isArray(rooms)
                ? rooms
                : [];
              const merged = baseList.some((r) => r.id === updatedRoom.id)
                ? baseList.map((r) =>
                    r.id === updatedRoom.id ? updatedRoom : r
                  )
                : [...baseList, updatedRoom];
              localStorage.setItem(storageKey, JSON.stringify(merged));
            } catch (e) {
              // ignore storage errors
            }

            // notify presence via socket (server may also broadcast)
            try {
              if (window?.socket) {
                window.socket.emit("join_room", {
                  roomId: updatedRoom.id,
                  displayName: user.name || updatedRoom?.ownerId || user.email,
                });
              }
            } catch {}

            toast.success(`Joined "${updatedRoom.name}"`, { duration: 2500 });
            // navigate back to /rooms where the UI picks up the selection
            navigate("/rooms");
          } else {
            // backend returned non-OK (404/500) -> fallback to optimistic join and socket emit
            const txt = await res.text().catch(() => "");
            console.warn("Join POST returned error:", res.status, txt);

            // optimistic local update
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

            // persist optimistic update safely
            try {
              const storageKey = user?.email
                ? "lc_ai_user_rooms_" + user.email
                : "lc_ai_guest_rooms";

              const raw = localStorage.getItem(storageKey);
              const stored = raw ? JSON.parse(raw) : null;
              const baseList = Array.isArray(stored)
                ? stored
                : Array.isArray(rooms)
                ? rooms
                : [];
              const merged = baseList.some((r) => r.id === localUpdated.id)
                ? baseList.map((r) =>
                    r.id === localUpdated.id ? localUpdated : r
                  )
                : [...baseList, localUpdated];
              localStorage.setItem(storageKey, JSON.stringify(merged));
            } catch (e) {}

            // emit socket presence so others see it (best-effort)
            try {
              if (window?.socket) {
                window.socket.emit("join_room", {
                  roomId: localUpdated.id,
                  displayName: user.name || localUpdated.ownerId || user.email,
                });
              }
            } catch (e) {}
            toast.success(`Joined "${room.name}" (local only)`, {
              duration: 2500,
            });
            navigate("/rooms");
          }
        } catch (err) {
          console.error("JoinRoom join error:", err);
          // fallback: optimistic local join + socket
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
          try {
            // persist optimistic update safely
            const storageKey = user?.email
              ? "lc_ai_user_rooms_" + user.email
              : "lc_ai_guest_rooms";

            const raw = localStorage.getItem(storageKey);
            const stored = raw ? JSON.parse(raw) : null;
            const baseList = Array.isArray(stored)
              ? stored
              : Array.isArray(rooms)
              ? rooms
              : [];
            const merged = baseList.some((r) => r.id === localUpdated.id)
              ? baseList.map((r) =>
                  r.id === localUpdated.id ? localUpdated : r
                )
              : [...baseList, localUpdated];
            localStorage.setItem(storageKey, JSON.stringify(merged));
          } catch (e) {}

          try {
            if (window?.socket) {
              window.socket.emit("join_room", {
                roomId: localUpdated.id,
                displayName: user.name || localUpdated.ownerId || user.email,
              });
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

      // Notify backend via socket for guest join (server usually handles guest joins via socket)
      try {
        if (window?.socket) {
          window.socket.emit("join_room_guest", {
            code: room.code || roomId,
            name: guestName.trim(),
            guestId,
          });
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
