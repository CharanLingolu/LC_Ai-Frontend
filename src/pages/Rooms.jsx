// src/pages/Rooms.jsx
import { useEffect, useState } from "react";
import RoomChat from "../components/RoomChat";
import RoomCall from "../components/RoomCall";
import { useAuth } from "../context/AuthContext";
import { useRooms } from "../context/RoomContext";
import { socket } from "../socket"; // 🔹 shared socket

const GUEST_ID_KEY = "lc_ai_guest_id";
const GUEST_NAME_KEY = "lc_ai_guest_name";
const GUEST_LAST_ROOM_KEY = "lc_ai_guest_last_room";
const GUEST_ROOMS_KEY = "lc_ai_guest_rooms";

function normalizeRoom(room) {
  if (!room) return null;
  return {
    ...room,
    id: room.id || room._id?.toString() || String(room.code),
  };
}

export default function Rooms() {
  const { user, isAuthenticated } = useAuth();
  const { rooms, setRooms } = useRooms();

  const [selectedRoomId, setSelectedRoomId] = useState(() => {
    return localStorage.getItem(GUEST_LAST_ROOM_KEY) || null;
  });

  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomAI, setNewRoomAI] = useState(true);
  const [joinCode, setJoinCode] = useState("");

  // unauthenticated but joined via code
  const [isGuest, setIsGuest] = useState(() => {
    return !!localStorage.getItem(GUEST_ID_KEY);
  });
  const [guestName, setGuestName] = useState(() => {
    return localStorage.getItem(GUEST_NAME_KEY) || "";
  });

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;

  // 🔹 1) On initial mount, restore guest rooms from localStorage (UI only)
  useEffect(() => {
    if (isAuthenticated) return;
    const stored = localStorage.getItem(GUEST_ROOMS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const normalized = (parsed || []).map(normalizeRoom).filter(Boolean);
        if (normalized.length > 0) {
          setRooms(normalized);
        }
      } catch (e) {
        console.warn("Failed to parse guest rooms from storage:", e);
      }
    }
  }, [isAuthenticated, setRooms]);

  // --- SOCKET LISTENERS ---
  useEffect(() => {
    const handleUpdate = (serverRooms) => {
      // incognito, not yet joined → don't show global list
      if (!isAuthenticated && !isGuest) return;

      const normalized = (serverRooms || []).map(normalizeRoom).filter(Boolean);

      // 🔹 If guest + server sent empty list, DON'T wipe local rooms
      if (!isAuthenticated && isGuest && normalized.length === 0) {
        return;
      }

      setRooms(normalized);

      // 🔹 Auto-select last room (for guest or logged user) after refresh
      if (!selectedRoomId && normalized.length > 0) {
        const storedLast = localStorage.getItem(GUEST_LAST_ROOM_KEY);
        const match = storedLast
          ? normalized.find((r) => r.id === storedLast)
          : null;

        if (match) {
          setSelectedRoomId(match.id);
        } else {
          setSelectedRoomId(normalized[0].id);
        }
      }
    };

    const handleGuestSuccess = ({ room, userId, displayName }) => {
      console.log("✅ guest_joined_success:", { room, userId, displayName });
      const normalized = normalizeRoom(room);
      if (!normalized) return;

      setIsGuest(true);
      if (displayName) {
        setGuestName(displayName);
        localStorage.setItem(GUEST_NAME_KEY, displayName);
      }

      localStorage.setItem(GUEST_ID_KEY, userId);
      localStorage.setItem(GUEST_LAST_ROOM_KEY, normalized.id);

      // 🔹 Merge into current rooms
      setRooms((prev) => {
        const filtered = prev.filter((r) => r.id !== normalized.id);
        const next = [...filtered, normalized];

        // also persist to localStorage for guests
        if (!isAuthenticated) {
          localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
        }
        return next;
      });

      setSelectedRoomId(normalized.id);
    };

    const handleRoomCreateFailed = (payload) => {
      console.warn("room_create_failed:", payload);
      const msg =
        payload?.message ||
        (payload?.reason === "LIMIT_REACHED"
          ? "You can only create up to 5 rooms."
          : "Failed to create room.");
      alert(msg);
    };

    socket.on("room_list_update", handleUpdate);
    socket.on("guest_joined_success", handleGuestSuccess);
    socket.on("room_create_failed", handleRoomCreateFailed);

    // 🔐 Identify this socket to the server
    if (isAuthenticated && user) {
      socket.emit("register_user", {
        userId: user._id || user.id,
        email: user.email,
      });
      socket.emit("request_room_list");
    } else {
      // guest path
      const storedGuestId = localStorage.getItem(GUEST_ID_KEY);
      const storedGuestName = localStorage.getItem(GUEST_NAME_KEY);

      if (storedGuestId) {
        setIsGuest(true);
        if (storedGuestName) setGuestName(storedGuestName);

        socket.emit("register_user", {
          userId: storedGuestId,
          email: null,
        });
        socket.emit("request_room_list");
      }
    }

    return () => {
      socket.off("room_list_update", handleUpdate);
      socket.off("guest_joined_success", handleGuestSuccess);
      socket.off("room_create_failed", handleRoomCreateFailed);
    };
  }, [isAuthenticated, isGuest, user, setRooms, selectedRoomId]);

  // Clear when fully logged out and not a guest
  useEffect(() => {
    if (!isAuthenticated && !isGuest) {
      setRooms([]);
      setSelectedRoomId(null);
      setGuestName("");
    }
  }, [isAuthenticated, isGuest, setRooms]);

  const generateRoomCode = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      alert("Only registered users can create rooms!");
      return;
    }

    const name = newRoomName.trim();
    if (!name) return;

    const ownerEmail = user.email;

    // client-side 5-room limit per owner
    const ownedRoomsCount = rooms.filter(
      (r) => r.ownerId === ownerEmail
    ).length;

    if (ownedRoomsCount >= 5) {
      alert("You can only create up to 5 rooms.");
      return;
    }

    const clientId = Date.now().toString();

    const newRoom = {
      id: clientId,
      name,
      allowAI: newRoomAI,
      ownerId: ownerEmail,
      code: generateRoomCode(),
      inviteLink: `${window.location.origin}/join/${clientId}`,
      members: [{ id: ownerEmail, name: user.name, role: "owner" }],
    };

    socket.emit("create_room", newRoom);
    setSelectedRoomId(clientId);
    setNewRoomName("");
  };

  const handleJoinRoom = (code) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    socket.emit("verify_room_code", trimmed, async (serverRoom) => {
      if (!serverRoom) {
        alert("❌ Room not found! Check the code.");
        return;
      }

      const roomName = serverRoom.name;

      if (isAuthenticated && user) {
        // 🔹 LOGGED-IN JOIN: also persist membership in DB using /api/rooms/join
        try {
          const res = await fetch("http://localhost:5000/api/rooms/join", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code: trimmed,
              userId: user._id || user.id,
              userName: user.name,
            }),
          });

          if (!res.ok) {
            console.error("Join room failed:", await res.text());
            alert("Failed to join room. Please try again.");
            return;
          }

          const joinedRoom = await res.json();
          const normalized = normalizeRoom(joinedRoom);

          setRooms((prev) => {
            if (prev.some((r) => r.id === normalized.id)) return prev;
            return [...prev, normalized];
          });

          setSelectedRoomId(normalized.id);
          localStorage.setItem(GUEST_LAST_ROOM_KEY, normalized.id);
        } catch (err) {
          console.error("Join room error:", err);
          alert("Failed to join room. Please try again.");
        }
      } else {
        // Guest / incognito
        const name = prompt(`Enter your name to join "${roomName}":`);
        if (!name || !name.trim()) return;

        const cleanName = name.trim();

        // stable guest id in localStorage
        let guestId = localStorage.getItem(GUEST_ID_KEY);
        if (!guestId) {
          guestId = `guest_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 8)}`;
          localStorage.setItem(GUEST_ID_KEY, guestId);
        }
        localStorage.setItem(GUEST_NAME_KEY, cleanName);

        setGuestName(cleanName);
        setIsGuest(true);

        console.log("Emitting join_room_guest:", {
          code: trimmed,
          name: cleanName,
          guestId,
        });

        socket.emit("join_room_guest", {
          code: trimmed,
          name: cleanName,
          guestId,
        });
      }
    });
  };

  const renameRoom = (roomId, newName) => {
    setRooms((prev) => {
      const next = prev.map((r) =>
        r.id === roomId ? { ...r, name: newName } : r
      );
      // persist guest rooms
      if (!isAuthenticated && isGuest) {
        localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
      }
      return next;
    });
    socket.emit("rename_room", { roomId, newName });
  };

  const deleteRoom = (roomId) => {
    setRooms((prev) => {
      const next = prev.filter((r) => r.id !== roomId);
      if (!isAuthenticated && isGuest) {
        localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
      }
      return next;
    });
    if (selectedRoomId === roomId) setSelectedRoomId(null);
    socket.emit("delete_room", roomId);
  };

  const toggleAI = (roomId) => {
    setRooms((prev) => {
      const next = prev.map((r) =>
        r.id === roomId ? { ...r, allowAI: !r.allowAI } : r
      );
      if (!isAuthenticated && isGuest) {
        localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
      }
      return next;
    });
    socket.emit("toggle_room_ai", roomId);
  };

  // 🔹 Guest Exit: clear local storage + state
  const handleGuestExit = () => {
    localStorage.removeItem(GUEST_ID_KEY);
    localStorage.removeItem(GUEST_NAME_KEY);
    localStorage.removeItem(GUEST_LAST_ROOM_KEY);
    localStorage.removeItem(GUEST_ROOMS_KEY);
    setIsGuest(false);
    setGuestName("");
    setRooms([]);
    setSelectedRoomId(null);
  };

  const SettingsMenu = ({ room }) => {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [nameValue, setNameValue] = useState(room.name);

    if (!isAuthenticated || room.ownerId !== user?.email) return null;

    return (
      <div
        className="absolute top-1 right-1 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition"
        >
          ⚙️
        </button>
        {open && (
          <div className="absolute top-8 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg w-40 p-1.5 z-20 shadow-xl text-xs space-y-1">
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="w-full text-left px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-slate-700 dark:text-slate-200"
              >
                ✏️ Rename
              </button>
            ) : (
              <div className="flex gap-1 p-1">
                <input
                  className="w-full px-1 py-0.5 rounded border bg-white dark:bg-gray-700 text-[10px] text-gray-900 dark:text-gray-100"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                />
                <button
                  onClick={() => {
                    const trimmed = nameValue.trim();
                    if (trimmed) renameRoom(room.id, trimmed);
                    setEditing(false);
                    setOpen(false);
                  }}
                  className="text-green-600 font-bold"
                >
                  ✓
                </button>
              </div>
            )}

            <button
              onClick={() => {
                toggleAI(room.id);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-slate-700 dark:text-slate-200"
            >
              🤖 {room.allowAI ? "Disable AI" : "Enable AI"}
            </button>

            <button
              onClick={() => {
                if (confirm("Delete room?")) deleteRoom(room.id);
              }}
              className="text-red-600 hover:text-red-700 w-full text-left px-2 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            >
              🗑 Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  const RoomCard = ({ room }) => (
    <div
      onClick={() => {
        setSelectedRoomId(room.id);
        localStorage.setItem(GUEST_LAST_ROOM_KEY, room.id);
      }}
      className={`relative p-3 rounded-xl cursor-pointer border transition-all flex flex-col justify-between shrink-0 
        w-[200px] min-w-[200px] md:w-full md:min-w-0
        ${
          selectedRoomId === room.id
            ? "bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-300 dark:ring-blue-900"
            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
        }`}
    >
      <div className="pr-6">
        <h3
          className={`font-bold text-xs truncate ${
            selectedRoomId === room.id
              ? "text-white"
              : "text-slate-800 dark:text-white"
          }`}
        >
          {room.name}
        </h3>
      </div>
      <SettingsMenu room={room} />
      <div className="flex items-center justify-between mt-1">
        <span
          className={`text-[10px] ${
            selectedRoomId === room.id ? "text-blue-100" : "text-gray-400"
          }`}
        >
          {room.members?.length || 0} members
        </span>
        {room.allowAI && <span className="text-[10px]">✨</span>}
      </div>
    </div>
  );

  const currentDisplayName =
    isAuthenticated && user?.name ? user.name : guestName || "Guest";

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col md:flex-row gap-4 p-4 max-w-7xl mx-auto">
      {/* LEFT COLUMN */}
      <div className="shrink-0 w-full md:w-80 flex flex-col gap-3">
        {/* CREATE / JOIN BOX */}
        <div className="shrink-0 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {isAuthenticated ? "New Room" : "Guest Join"}
            </h3>

            {!isAuthenticated && isGuest && (
              <button
                type="button"
                onClick={handleGuestExit}
                className="text-[10px] px-2 py-0.5 rounded-full border border-red-400 text-red-500 hover:bg-red-500/10"
              >
                Exit
              </button>
            )}
          </div>

          {isAuthenticated && (
            <form onSubmit={handleCreateRoom} className="flex gap-1">
              <input
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Name..."
                className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              <button className="bg-slate-800 hover:bg-slate-700 text-white px-3 rounded text-xs transition">
                +
              </button>
            </form>
          )}

          <div
            className={`flex gap-1 ${
              isAuthenticated
                ? "pt-2 border-t border-gray-200 dark:border-gray-700"
                : ""
            }`}
          >
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter Room Code"
              className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 focus:ring-1 focus:ring-green-500 outline-none"
            />
            <button
              onClick={() => handleJoinRoom(joinCode)}
              className="text-green-600 hover:text-green-700 text-xs font-bold px-1 transition"
            >
              Join
            </button>
          </div>
        </div>

        {/* ROOM LIST */}
        <div className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-auto pb-2 md:pb-0 min-h-[90px] md:min-h-0 md:flex-1 pr-1">
          {rooms.length === 0 && (
            <div className="shrink-0 w-full flex items-center justify-center p-4 text-xs text-gray-400 border border-gray-100 dark:border-gray-700 rounded-xl">
              {isAuthenticated || isGuest
                ? "No rooms available."
                : "Enter a code to join."}
            </div>
          )}
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden gap-3">
        {selectedRoom ? (
          <>
            <div className="shrink-0">
              <RoomCall room={selectedRoom} displayName={currentDisplayName} />
            </div>
            <div className="flex-1 min-h-0 relative">
              <RoomChat room={selectedRoom} displayName={currentDisplayName} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 text-gray-400 p-8">
            <span className="text-4xl mb-3 opacity-50">👋</span>
            <p className="text-sm">Select or join a room to start.</p>
          </div>
        )}
      </div>
    </div>
  );
}
