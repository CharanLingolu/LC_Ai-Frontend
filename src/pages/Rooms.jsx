// src/pages/Rooms.jsx
import { useEffect, useState } from "react";
import RoomChat from "../components/RoomChat";
import RoomCall from "../components/RoomCall";
import { useAuth } from "../context/AuthContext";
import { useRooms } from "../context/RoomContext";
import { socket } from "../socket";
import toast from "react-hot-toast";

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

  const [pendingRoomCode, setPendingRoomCode] = useState(null);

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
      if (!isAuthenticated && !isGuest) return;

      const normalized = (serverRooms || []).map(normalizeRoom).filter(Boolean);

      // If server sent empty list, don't wipe local (protect guest rooms)
      if (normalized.length === 0) return;

      setRooms((prev) => {
        const withPresence = normalized.map((room) => {
          const prevMatch = prev.find((p) => p.id === room.id);
          if (prevMatch && typeof prevMatch.onlineCount === "number") {
            return { ...room, onlineCount: prevMatch.onlineCount };
          }
          return room;
        });

        // 🔹 Persist latest room state (including allowAI) for this user/guest
        if (isAuthenticated && user?.email) {
          const key = getUserRoomsKey(user.email);
          if (key) {
            localStorage.setItem(key, JSON.stringify(withPresence));
          }
        } else if (isGuest) {
          localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(withPresence));
        }

        return withPresence;
      });

      setSelectedRoomId((prevId) => {
        if (pendingRoomCode) {
          const byCode = normalized.find(
            (r) => String(r.code) === String(pendingRoomCode)
          );
          if (byCode) {
            localStorage.setItem(LAST_ROOM_KEY, byCode.id);
            setPendingRoomCode(null);
            toast.success(`Room "${byCode.name}" created 🎉`);
            return byCode.id;
          }
        }

        if (prevId) {
          const prevExists = normalized.find((r) => r.id === prevId);
          if (prevExists) {
            localStorage.setItem(LAST_ROOM_KEY, prevExists.id);
            return prevExists.id;
          }
        }

        const storedLast = localStorage.getItem(LAST_ROOM_KEY);
        const matchStored = storedLast
          ? normalized.find((r) => r.id === storedLast)
          : null;

        if (matchStored) {
          localStorage.setItem(LAST_ROOM_KEY, matchStored.id);
          return matchStored.id;
        }

        localStorage.removeItem(LAST_ROOM_KEY);
        return null;
      });
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
      toast.success(`Joined room "${normalized.name}" as guest ✅`);
    };

    const handleRoomCreateFailed = (payload) => {
      const msg =
        payload?.message ||
        (payload?.reason === "LIMIT_REACHED"
          ? "You can only create up to 5 rooms."
          : "Failed to create room.");
      toast.error(msg);
    };

    socket.on("room_list_update", handleUpdate);
    socket.on("guest_joined_success", handleGuestSuccess);
    socket.on("room_create_failed", handleRoomCreateFailed);

    // ⭐ ONLINE COUNT update
    socket.on("active_users_update", ({ roomId, count }) => {
      setRooms((prev) =>
        prev.map((room) => {
          const matches =
            room.id === roomId ||
            String(room._id) === String(roomId) ||
            String(room.code) === String(roomId);
          return matches ? { ...room, onlineCount: count } : room;
        })
      );
    });

    const handleRoomAIToggled = ({ roomId, allowAI }) => {
      setRooms((prev) => {
        const updated = prev.map((room) => {
          const matches =
            room.id === roomId ||
            String(room._id) === String(roomId) ||
            String(room.code) === String(roomId);
          return matches ? { ...room, allowAI } : room;
        });

        // Persist updated allowAI to localStorage
        if (isAuthenticated && user?.email) {
          const key = getUserRoomsKey(user.email);
          if (key) {
            localStorage.setItem(key, JSON.stringify(updated));
          }
        } else if (isGuest) {
          localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(updated));
        }

        return updated;
      });

      toast(allowAI ? "🤖 AI enabled for this room" : "🚫 AI disabled", {
        icon: "✨",
      });
    };

    socket.on("room_ai_toggled", handleRoomAIToggled);

    if (isAuthenticated && user) {
      socket.emit("register_user", {
        userId: user._id || user.id,
        email: user.email,
      });
      socket.emit("request_room_list");
    } else {
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
      socket.off("active_users_update");
      socket.off("room_ai_toggled", handleRoomAIToggled);
    };
  }, [isAuthenticated, isGuest, user, setRooms, pendingRoomCode]);

  // ---------- 3) Clear when fully logged out and not a guest ----------
  useEffect(() => {
    if (!isAuthenticated && !isGuest) {
      setRooms([]);
      setSelectedRoomId(null);
      setGuestName("");
    }
  }, [isAuthenticated, isGuest, setRooms]);

  // ---------- 4) JOIN / LEAVE ROOM (for presence) ----------
  useEffect(() => {
    if (!selectedRoomId) return;

    const roomKey = selectedRoomId;
    const displayName =
      isAuthenticated && user?.name ? user.name : guestName || "Guest";

    socket.emit("join_room", {
      roomId: roomKey,
      displayName,
    });

    return () => {
      socket.emit("leave_room", { roomId: roomKey });
    };
  }, [selectedRoomId, isAuthenticated, user?.name, guestName]);

  const generateRoomCode = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

  // ---------- CREATE ROOM ----------
  const handleCreateRoom = (e) => {
    if (e?.preventDefault) e.preventDefault();

    if (!isAuthenticated) {
      toast.error("Only registered users can create rooms!");
      return;
    }

    const name = newRoomName.trim();
    if (!name) {
      toast("Give your room a cute name first 🧃");
      return;
    }

    const ownerEmail = user.email;

    const ownedRoomsCount = (rooms || []).filter(
      (r) => r.ownerId === ownerEmail
    ).length;
    if (ownedRoomsCount >= 5) {
      toast.error("You can only create up to 5 rooms.");
      return;
    }

    const code = generateRoomCode();

    const newRoomPayload = {
      name,
      allowAI: newRoomAI,
      ownerId: ownerEmail,
      code,
      inviteLink: `${window.location.origin}/join`,
      members: [{ id: ownerEmail, name: user.name, role: "owner" }],
    };

    socket.emit("create_room", newRoomPayload);

    setPendingRoomCode(code);
    setNewRoomName("");
    toast.loading("Creating room...", { id: "create-room" });
  };

  const handleJoinRoom = (code) => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast("Enter a room code first ✨");
      return;
    }

    socket.emit("verify_room_code", trimmed, async (serverRoom) => {
      if (!serverRoom) {
        toast.error("Room not found. Check the code again.");
        return;
      }

      const roomName = serverRoom.name;

      if (isAuthenticated && user) {
        try {
          const res = await fetch(
            "https://lc-ai-backend-a080.onrender.com/api/rooms/join",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                code: trimmed,
                userId: user._id || user.id,
                userName: user.name,
              }),
            }
          );

          if (!res.ok) {
            toast.error("Failed to join room. Please try again.");
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
          toast.success(`Joined room "${normalized.name}" ✅`);
        } catch (err) {
          console.error("Join room error:", err);
          toast.error("Failed to join room. Please try again.");
        }
      } else {
        // Guest join using inline name input instead of window.prompt
        const existingName = guestName && guestName.trim();
        const cleanName = existingName;

        if (!cleanName) {
          toast.error(
            `Add your name in the "Your name" box before joining "${roomName}".`
          );
          return;
        }

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

        toast.success(`Joining "${roomName}" as ${cleanName} ✨`);
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
    toast.success("Room renamed ✏️");
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
    toast("Room deleted 🗑️");
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

  const handleGuestExit = () => {
    localStorage.removeItem(GUEST_ID_KEY);
    localStorage.removeItem(GUEST_NAME_KEY);
    localStorage.removeItem(LAST_ROOM_KEY);
    localStorage.removeItem(GUEST_ROOMS_KEY);
    setIsGuest(false);
    setGuestName("");
    setRooms([]);
    setSelectedRoomId(null);
    toast("Guest session cleared 👋");
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

            {/* Toast-based delete confirmation instead of window.confirm */}
            <button
              onClick={() => {
                toast.custom(
                  (t) => (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-xl text-xs max-w-xs">
                      <p className="mb-2 text-gray-800 dark:text-gray-100">
                        Delete room{" "}
                        <span className="font-semibold">"{room.name}"</span>?
                      </p>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => toast.dismiss(t.id)}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            deleteRoom(room.id);
                            toast.dismiss(t.id);
                          }}
                          className="px-2 py-1 rounded bg-red-500 text-white"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ),
                  { duration: 5000 }
                );
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
          {room.onlineCount || 0} online / {room.members?.length || 0} total
        </span>
        {room.allowAI && <span className="text-[10px]">✨</span>}
      </div>
    </div>
  );

  const currentDisplayName =
    isAuthenticated && user?.name ? user.name : guestName || "Guest";

  return (
    <div className="h-[calc(100dvh-64px)] w-full flex flex-col md:flex-row gap-4 p-2 sm:p-4 max-w-7xl mx-auto overflow-hidden">
      {/* LEFT COLUMN: Sidebar (Room List) */}
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
            <form className="flex gap-1" onSubmit={handleCreateRoom}>
              <input
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Name..."
                className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none"
              />
              <button
                type="submit"
                className="bg-slate-800 text-white px-3 rounded text-xs transition"
              >
                +
              </button>
            </form>
          )}

          {/* Guest name input block instead of window.prompt */}
          {!isAuthenticated && (
            <div className="flex gap-1">
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Your name"
                className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 outline-none"
              />
            </div>
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

      {/* RIGHT COLUMN: Call + Chat */}
      <div
        className={`flex-1 flex flex-col min-h-0 overflow-hidden gap-2 pb-1 ${
          !selectedRoomId ? "hidden md:flex" : "flex"
        }`}
      >
        {selectedRoom ? (
          <>
            {/* Mobile header with Back + Exit */}
            <div className="md:hidden flex items-center justify-between gap-2 pb-2 border-b border-gray-200 dark:border-gray-700 mb-1">
              <button
                onClick={() => {
                  localStorage.removeItem(LAST_ROOM_KEY);
                  setSelectedRoomId(null);
                }}
                className="text-sm text-gray-500 dark:text-gray-300 flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
              >
                ← Back
              </button>

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
