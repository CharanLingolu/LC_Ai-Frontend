// src/pages/Rooms.jsx
import { useEffect, useState } from "react";
import RoomChat from "../components/RoomChat";
import RoomCall from "../components/RoomCall";
import { useAuth } from "../context/AuthContext";
import { useRooms } from "../context/RoomContext";
import { socket } from "../socket";

const GUEST_ID_KEY = "lc_ai_guest_id";
const GUEST_NAME_KEY = "lc_ai_guest_name";
const LAST_ROOM_KEY = "lc_ai_last_room";
const GUEST_ROOMS_KEY = "lc_ai_guest_rooms";
const USER_ROOMS_PREFIX = "lc_ai_user_rooms_";

function normalizeRoom(room) {
  if (!room) return null;
  return {
    ...room,
    id: room.id || room._id?.toString() || String(room.code),
  };
}

function getUserRoomsKey(email) {
  if (!email) return null;
  return USER_ROOMS_PREFIX + email;
}

export default function Rooms() {
  const { user, isAuthenticated } = useAuth();
  const { rooms, setRooms } = useRooms();

  const [selectedRoomId, setSelectedRoomId] = useState(() => {
    return localStorage.getItem(LAST_ROOM_KEY) || null;
  });

  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomAI, setNewRoomAI] = useState(true);
  const [joinCode, setJoinCode] = useState("");

  const [isGuest, setIsGuest] = useState(() => {
    return !!localStorage.getItem(GUEST_ID_KEY);
  });
  const [guestName, setGuestName] = useState(() => {
    return localStorage.getItem(GUEST_NAME_KEY) || "";
  });

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;

  // ---------- 1) Restore rooms from localStorage on mount ----------
  useEffect(() => {
    if (isAuthenticated && user?.email) {
      const key = getUserRoomsKey(user.email);
      if (key) {
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            const normalized = (parsed || [])
              .map(normalizeRoom)
              .filter(Boolean);
            if (normalized.length > 0) {
              setRooms(normalized);
            }
          } catch (e) {
            console.warn("Failed to parse user rooms from storage:", e);
          }
        }
      }
    } else {
      // guest path
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
    }
  }, [isAuthenticated, user?.email, setRooms]);

  // ---------- 2) Socket listeners ----------
  useEffect(() => {
    const handleUpdate = (serverRooms) => {
      // incognito, not yet joined → don't show global list
      if (!isAuthenticated && !isGuest) return;

      const normalized = (serverRooms || []).map(normalizeRoom).filter(Boolean);

      // If server sent empty list, DON'T wipe what we already have
      if (normalized.length === 0) return;

      setRooms(normalized);

      // persist updated rooms
      if (isAuthenticated && user?.email) {
        const key = getUserRoomsKey(user.email);
        if (key) {
          localStorage.setItem(key, JSON.stringify(normalized));
        }
      } else if (isGuest) {
        localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(normalized));
      }

      // Auto-select room on refresh ONLY if we have a stored preference
      const storedLast = localStorage.getItem(LAST_ROOM_KEY);
      const matchStored = storedLast
        ? normalized.find((r) => r.id === storedLast)
        : null;

      if (matchStored) {
        setSelectedRoomId(matchStored.id);
      }
    };

    const handleGuestSuccess = ({ room, userId, displayName }) => {
      const normalized = normalizeRoom(room);
      if (!normalized) return;

      setIsGuest(true);
      if (displayName) {
        setGuestName(displayName);
        localStorage.setItem(GUEST_NAME_KEY, displayName);
      }

      localStorage.setItem(GUEST_ID_KEY, userId);
      localStorage.setItem(LAST_ROOM_KEY, normalized.id);

      setRooms((prev) => {
        const filtered = prev.filter((r) => r.id !== normalized.id);
        const next = [...filtered, normalized];
        localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
        return next;
      });

      setSelectedRoomId(normalized.id);
    };

    const handleRoomCreateFailed = (payload) => {
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

  // ---------- 3) Clear when fully logged out and not a guest ----------
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
    localStorage.setItem(LAST_ROOM_KEY, clientId);
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
        // LOGGED-IN JOIN: persist membership in DB
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
            alert("Failed to join room. Please try again.");
            return;
          }

          const joinedRoom = await res.json();
          const normalized = normalizeRoom(joinedRoom);

          setRooms((prev) => {
            const filtered = prev.filter((r) => r.id !== normalized.id);
            const next = [...filtered, normalized];

            if (user.email) {
              const key = getUserRoomsKey(user.email);
              if (key) {
                localStorage.setItem(key, JSON.stringify(next));
              }
            }

            return next;
          });

          setSelectedRoomId(normalized.id);
          localStorage.setItem(LAST_ROOM_KEY, normalized.id);
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

      if (isAuthenticated && user?.email) {
        const key = getUserRoomsKey(user.email);
        if (key) {
          localStorage.setItem(key, JSON.stringify(next));
        }
      } else if (isGuest) {
        localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
      }

      return next;
    });
    socket.emit("rename_room", { roomId, newName });
  };

  const deleteRoom = (roomId) => {
    setRooms((prev) => {
      const next = prev.filter((r) => r.id !== roomId);

      if (isAuthenticated && user?.email) {
        const key = getUserRoomsKey(user.email);
        if (key) {
          localStorage.setItem(key, JSON.stringify(next));
        }
      } else if (isGuest) {
        localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
      }

      return next;
    });

    if (selectedRoomId === roomId) {
      setSelectedRoomId(null);
      localStorage.removeItem(LAST_ROOM_KEY);
    }

    socket.emit("delete_room", roomId);
  };

  const toggleAI = (roomId) => {
    setRooms((prev) => {
      const next = prev.map((r) =>
        r.id === roomId ? { ...r, allowAI: !r.allowAI } : r
      );

      if (isAuthenticated && user?.email) {
        const key = getUserRoomsKey(user.email);
        if (key) {
          localStorage.setItem(key, JSON.stringify(next));
        }
      } else if (isGuest) {
        localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
      }

      return next;
    });
    socket.emit("toggle_room_ai", roomId);
  };

  // Guest Exit: clear local storage + state
  const handleGuestExit = () => {
    localStorage.removeItem(GUEST_ID_KEY);
    localStorage.removeItem(GUEST_NAME_KEY);
    localStorage.removeItem(LAST_ROOM_KEY);
    localStorage.removeItem(GUEST_ROOMS_KEY);
    setIsGuest(false);
    setGuestName("");
    setRooms([]);
    setSelectedRoomId(null);
    window.location.reload();
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
          className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 transition"
        >
          ⚙️
        </button>
        {open && (
          <div className="absolute top-8 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg w-40 p-1.5 z-20 shadow-xl text-xs space-y-1">
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="w-full text-left px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded dark:text-gray-200"
              >
                ✏️ Rename
              </button>
            ) : (
              <div className="flex gap-1 p-1">
                <input
                  className="w-full px-1 py-0.5 rounded border bg-white dark:bg-gray-700 text-[10px] dark:text-white"
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
              className="w-full text-left px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded dark:text-gray-200"
            >
              🤖 {room.allowAI ? "Disable AI" : "Enable AI"}
            </button>

            <button
              onClick={() => {
                if (confirm("Delete room?")) deleteRoom(room.id);
              }}
              className="text-red-600 w-full text-left px-2 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
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
        localStorage.setItem(LAST_ROOM_KEY, room.id);
      }}
      className={`relative p-3 rounded-xl cursor-pointer border transition-all flex flex-col justify-between shrink-0 
        w-full min-h-[80px]
        ${
          selectedRoomId === room.id
            ? "bg-blue-600 text-white border-blue-600 shadow-md"
            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
        }`}
    >
      <div className="pr-6">
        <h3
          className={`font-bold text-sm truncate ${
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
    // FIX 1: Main Container uses 'dvh' to support mobile browsers, fixed height prevents body scroll
    <div className="h-[calc(100dvh-64px)] w-full flex flex-col md:flex-row gap-4 p-2 sm:p-4 max-w-7xl mx-auto overflow-hidden">
      {/* LEFT COLUMN: Sidebar (Room List) */}
      {/* Logic: Hidden on mobile IF a room is selected. Visible on Desktop always. */}
      <div
        className={`shrink-0 w-full md:w-80 flex flex-col gap-3 h-full overflow-hidden ${
          selectedRoomId ? "hidden md:flex" : "flex"
        }`}
      >
        {/* CREATE / JOIN BOX */}
        <div className="shrink-0 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {isAuthenticated ? "New Room" : "Guest Join"}
            </h3>

            {/* Guest Exit Button - Sidebar Version (Visible when no chat selected) */}
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
                className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none"
              />
              <button className="bg-slate-800 text-white px-3 rounded text-xs transition">
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
              className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none"
            />
            <button
              onClick={() => handleJoinRoom(joinCode)}
              className="text-green-600 text-xs font-bold px-1"
            >
              Join
            </button>
          </div>
        </div>

        {/* ROOM LIST - Scrolls internally */}
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-2 pr-1 pb-1">
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

      {/* RIGHT COLUMN: Chat Area */}
      {/* Logic: On Mobile, only visible if room selected. On Desktop always visible. */}
      <div
        className={`flex-1 flex flex-col min-h-0 overflow-hidden gap-2 pb-1 ${
          !selectedRoomId ? "hidden md:flex" : "flex"
        }`}
      >
        {selectedRoom ? (
          <>
            {/* FIX 2: Mobile Header with 'Back' AND 'Exit' buttons */}
            <div className="md:hidden flex items-center justify-between gap-2 pb-2 border-b border-gray-200 dark:border-gray-700 mb-1">
              {/* BACK BUTTON FIX: Must clear local storage to stop auto-rejoin loop */}
              <button
                onClick={() => {
                  localStorage.removeItem(LAST_ROOM_KEY);
                  setSelectedRoomId(null);
                }}
                className="text-sm text-gray-500 dark:text-gray-300 flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
              >
                ← Back
              </button>

              {/* GUEST EXIT BUTTON: Added here so guests can exit while inside a room */}
              {!isAuthenticated && isGuest && (
                <button
                  onClick={handleGuestExit}
                  className="text-xs text-red-500 border border-red-500/50 px-2 py-1 rounded hover:bg-red-500/10"
                >
                  Exit Session
                </button>
              )}
            </div>

            <div className="shrink-0">
              <RoomCall room={selectedRoom} displayName={currentDisplayName} />
            </div>

            {/* Chat takes remaining height */}
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
