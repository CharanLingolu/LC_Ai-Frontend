// src/pages/Rooms.jsx
import { createPortal } from "react-dom";
import { useEffect, useState, useRef } from "react";
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
const HIDDEN_ROOMS_PREFIX = "lc_ai_hidden_rooms_"; // per-user hidden rooms

// Toast durations
const TOAST_DURATION = {
  success: 3000,
  info: 3000,
  error: 5000,
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
const DEFAULT_JOIN_PATHS = [
  "/api/rooms/join",
  "/rooms/join",
  "/api/rooms/join/verify",
  "/api/join-room",
  "/join/room",
];

function normalizeRoom(room) {
  if (!room) return null;
  return {
    ...room,
    id: room.id || room._id?.toString() || String(room.code),
  };
}

// -- safe persist of a single updatedRoom into localStorage (read-modify-write)
const persistRoomToStorage = (storageKey, updatedRoom) => {
  try {
    const raw = localStorage.getItem(storageKey);
    const stored = raw ? JSON.parse(raw) : null;
    const baseList = Array.isArray(stored)
      ? stored
      : Array.isArray(rooms)
      ? rooms
      : [];
    const merged = baseList.some((r) => String(r.id) === String(updatedRoom.id))
      ? baseList.map((r) =>
          String(r.id) === String(updatedRoom.id) ? updatedRoom : r
        )
      : [...baseList, updatedRoom];
    localStorage.setItem(storageKey, JSON.stringify(merged));
  } catch (e) {
    console.warn("persistRoomToStorage failed", e);
  }
};

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

  // ensure pendingRoomCode state exists (was missing in error)
  const [pendingRoomCode, setPendingRoomCode] = useState(null);

  const [isGuest, setIsGuest] = useState(() => {
    return !!localStorage.getItem(GUEST_ID_KEY);
  });
  const [guestName, setGuestName] = useState(() => {
    return localStorage.getItem(GUEST_NAME_KEY) || "";
  });

  // Refs to handle mutable data inside listeners without re-triggering effects
  const createToastIdRef = useRef(null);
  const pendingRoomCodeRef = useRef(null);
  const hiddenRoomsRef = useRef([]);

  // Refs for User data so the socket listener can see them without stale closures
  const userRef = useRef(user);
  const isAuthenticatedRef = useRef(isAuthenticated);

  // hidden rooms set
  const [hiddenRooms, setHiddenRooms] = useState(() => {
    const key = getHiddenKey();
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;

  // ---------- helper: hidden rooms per user ----------
  function getHiddenKey() {
    if (isAuthenticated && user?.email) return HIDDEN_ROOMS_PREFIX + user.email;
    const guestId = localStorage.getItem(GUEST_ID_KEY) || "anon";
    return HIDDEN_ROOMS_PREFIX + "guest_" + guestId;
  }

  function saveHiddenRooms(next) {
    const key = getHiddenKey();
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    setHiddenRooms(next);
  }

  function hideRoomForMe(roomId) {
    if (!roomId) return;
    const next = Array.from(new Set([...(hiddenRooms || []), String(roomId)]));
    saveHiddenRooms(next);

    setRooms((prev) => prev.filter((r) => String(r.id) !== String(roomId)));

    if (String(selectedRoomId) === String(roomId)) {
      setSelectedRoomId(null);
      try {
        localStorage.removeItem(LAST_ROOM_KEY);
      } catch {}
    }

    try {
      socket.emit("leave_room", { roomId });
    } catch {}

    toast.success("You left the room.", {
      duration: TOAST_DURATION.success,
    });
  }

  function unhideRoomForMe(roomId) {
    if (!roomId) return;
    const next = (hiddenRooms || []).filter(
      (id) => String(id) !== String(roomId)
    );
    saveHiddenRooms(next);
  }

  function applyHiddenFilter(serverRooms) {
    const currentHidden = hiddenRoomsRef.current || [];
    const hiddenMap = new Set(currentHidden.map((h) => String(h)));
    return (serverRooms || [])
      .map(normalizeRoom)
      .filter(Boolean)
      .filter((r) => !hiddenMap.has(String(r.id)));
  }

  // ---------- 1. Sync State to Refs ----------
  useEffect(() => {
    hiddenRoomsRef.current = hiddenRooms;
    userRef.current = user;
    isAuthenticatedRef.current = isAuthenticated;
  }, [hiddenRooms, user, isAuthenticated]);

  // ---------- 2. Restore rooms from localStorage ----------
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
              const visible = normalized.filter(
                (r) => !hiddenRooms.includes(String(r.id))
              );
              setRooms(visible);
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
            const visible = normalized.filter(
              (r) => !hiddenRooms.includes(String(r.id))
            );
            setRooms(visible);
          }
        } catch (e) {
          console.warn("Failed to parse guest rooms from storage:", e);
        }
      }
    }
  }, [isAuthenticated, user?.email, setRooms, hiddenRooms]);

  // ---------- 3. Registration Effect ----------
  useEffect(() => {
    const performRegistration = () => {
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

          const lastRoomId = localStorage.getItem(LAST_ROOM_KEY);
          const guestRoomsStr = localStorage.getItem(GUEST_ROOMS_KEY);
          if (lastRoomId && guestRoomsStr) {
            try {
              const guestRooms = JSON.parse(guestRoomsStr);
              const match = guestRooms.find(
                (r) => String(r.id) === String(lastRoomId)
              );
              if (match && match.code) {
                socket.emit("join_room_guest", {
                  code: match.code,
                  name: storedGuestName || "Guest",
                  guestId: storedGuestId,
                });
              }
            } catch (e) {}
          }

          socket.emit("register_user", {
            userId: storedGuestId,
            email: null,
          });
          socket.emit("request_room_list");
        }
      }
    };

    performRegistration();
  }, [isAuthenticated, user?._id, user?.email, isGuest]);

  // ---------- 4. Socket Listeners Effect ----------
  useEffect(() => {
    const handleUpdate = (serverRooms) => {
      const currentUser = userRef.current;
      const isAuth = isAuthenticatedRef.current;

      let normalized = applyHiddenFilter(serverRooms);

      let myJoinedRoomIds = new Set();
      try {
        const storageKey = localStorage.getItem(GUEST_ID_KEY)
          ? GUEST_ROOMS_KEY
          : isAuth && currentUser?.email
          ? getUserRoomsKey(currentUser.email)
          : null;

        if (storageKey) {
          const stored = localStorage.getItem(storageKey) || "[]";
          const parsed = JSON.parse(stored);
          parsed.forEach((r) => {
            const nr = normalizeRoom(r);
            if (nr && nr.id) myJoinedRoomIds.add(String(nr.id));
          });
        }
      } catch (e) {}

      normalized = normalized.filter((room) => {
        // Use currentUser from Ref to avoid stale closure
        const isOwner =
          isAuth && currentUser?.email && room.ownerId === currentUser.email;
        const hasJoined = myJoinedRoomIds.has(String(room.id));
        return isOwner || hasJoined;
      });

      setRooms((prev) => {
        const withPresence = normalized.map((room) => {
          const prevMatch = prev.find((p) => p.id === room.id);
          let stableCount = room.onlineCount;
          if (prevMatch && typeof prevMatch.onlineCount === "number") {
            if (
              stableCount === undefined ||
              (stableCount === 0 && prevMatch.onlineCount > 0)
            ) {
              stableCount = prevMatch.onlineCount;
            }
          }
          return { ...room, onlineCount: stableCount };
        });

        if (isAuth && currentUser?.email) {
          const key = getUserRoomsKey(currentUser.email);
          if (key) {
            try {
              localStorage.setItem(key, JSON.stringify(withPresence));
            } catch (e) {}
          }
        } else {
          const storedGuestId = localStorage.getItem(GUEST_ID_KEY);
          if (storedGuestId) {
            try {
              localStorage.setItem(
                GUEST_ROOMS_KEY,
                JSON.stringify(withPresence)
              );
            } catch (e) {}
          }
        }

        return withPresence;
      });

      // --- Robust handling of pending room creation (clear toast once) ---
      if (pendingRoomCodeRef.current) {
        const codeToFind = String(pendingRoomCodeRef.current);
        const byCode = normalized.find((r) => String(r.code) === codeToFind);

        if (byCode) {
          setTimeout(() => {
            try {
              localStorage.setItem(LAST_ROOM_KEY, byCode.id);
            } catch (e) {}

            // Dismiss earlier "Creating room..." toast if we have an id
            if (createToastIdRef.current) {
              try {
                toast.dismiss(createToastIdRef.current);
              } catch (e) {}
              createToastIdRef.current = null;
            }

            toast.success(`Room "${byCode.name}" created 🎉`, {
              duration: TOAST_DURATION.success,
            });

            // clear pending
            setPendingRoomCode(null);
            pendingRoomCodeRef.current = null;

            // select new room
            setSelectedRoomId(byCode.id);
          }, 0);

          return;
        }
      }

      setSelectedRoomId((prevId) => {
        if (prevId) {
          const prevExists = normalized.find((r) => r.id === prevId);
          if (prevExists) {
            try {
              localStorage.setItem(LAST_ROOM_KEY, prevExists.id);
            } catch (e) {}
            return prevExists.id;
          }
        }
        const storedLast = localStorage.getItem(LAST_ROOM_KEY);
        const matchStored = storedLast
          ? normalized.find((r) => r.id === storedLast)
          : null;
        if (matchStored) {
          try {
            localStorage.setItem(LAST_ROOM_KEY, matchStored.id);
          } catch (e) {}
          return matchStored.id;
        }
        return null;
      });
    };

    const handleGuestSuccess = ({ room, userId, displayName }) => {
      const normalized = normalizeRoom(room);
      if (!normalized) return;

      unhideRoomForMe(normalized.id);
      setIsGuest(true);
      if (displayName) {
        setGuestName(displayName);
        try {
          localStorage.setItem(GUEST_NAME_KEY, displayName);
        } catch (e) {}
      }
      try {
        localStorage.setItem(GUEST_ID_KEY, userId);
        localStorage.setItem(LAST_ROOM_KEY, normalized.id);
      } catch (e) {}

      setRooms((prev) => {
        const filtered = prev.filter((r) => r.id !== normalized.id);
        const next = [...filtered, normalized];
        try {
          localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
        } catch (e) {}
        return next;
      });
      setSelectedRoomId(normalized.id);
    };

    const handleRoomCreateFailed = (payload) => {
      const msg = payload?.message || "Failed to create room.";
      if (createToastIdRef.current) {
        try {
          toast.dismiss(createToastIdRef.current);
        } catch (e) {}
        createToastIdRef.current = null;
      }
      setPendingRoomCode(null);
      pendingRoomCodeRef.current = null;
      toast.error(msg, { duration: TOAST_DURATION.error });
    };

    const handleActiveUsersUpdate = ({ roomId, count }) => {
      setRooms((prev) =>
        prev.map((room) => {
          const matches =
            room.id === roomId ||
            String(room._id) === String(roomId) ||
            String(room.code) === String(roomId);
          if (matches && room.onlineCount !== count) {
            return { ...room, onlineCount: count };
          }
          return room;
        })
      );
    };

    const handleRoomAIToggled = ({ roomId, allowAI }) => {
      setRooms((prev) => {
        const updated = prev.map((room) => {
          const matches =
            room.id === roomId ||
            String(room._id) === String(roomId) ||
            String(room.code) === String(roomId);
          return matches ? { ...room, allowAI } : room;
        });

        const currentUser = userRef.current;
        const isAuth = isAuthenticatedRef.current;

        if (isAuth && currentUser?.email) {
          const key = getUserRoomsKey(currentUser.email);
          if (key)
            try {
              localStorage.setItem(key, JSON.stringify(updated));
            } catch (e) {}
        } else {
          try {
            localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(updated));
          } catch (e) {}
        }
        return updated;
      });
      toast(allowAI ? "🤖 AI enabled for this room" : "🚫 AI disabled", {
        icon: "✨",
        duration: TOAST_DURATION.info,
      });
    };

    socket.on("room_list_update", handleUpdate);
    socket.on("guest_joined_success", handleGuestSuccess);
    socket.on("room_create_failed", handleRoomCreateFailed);
    socket.on("active_users_update", handleActiveUsersUpdate);
    socket.on("room_ai_toggled", handleRoomAIToggled);

    return () => {
      socket.off("room_list_update", handleUpdate);
      socket.off("guest_joined_success", handleGuestSuccess);
      socket.off("room_create_failed", handleRoomCreateFailed);
      socket.off("active_users_update", handleActiveUsersUpdate);
      socket.off("room_ai_toggled", handleRoomAIToggled);
    };
  }, []);

  // ---------- Clear when logged out ----------
  useEffect(() => {
    if (!isAuthenticated && !isGuest) {
      setRooms([]);
      setSelectedRoomId(null);
      setGuestName("");
    }
  }, [isAuthenticated, isGuest, setRooms]);

  // ---------- Presence join/leave ----------
  useEffect(() => {
    if (!selectedRoomId) return;

    const roomKey = selectedRoomId;
    const displayName =
      isAuthenticated && user?.name ? user.name : guestName || "Guest";

    const joinCurrentRoom = () => {
      socket.emit("join_room", { roomId: roomKey, displayName });
    };

    joinCurrentRoom();
    socket.on("connect", joinCurrentRoom);

    return () => {
      socket.emit("leave_room", { roomId: roomKey });
      socket.off("connect", joinCurrentRoom);
    };
  }, [selectedRoomId, isAuthenticated, user?.name, guestName]);

  const generateRoomCode = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

  // ---------- CREATE ROOM ----------
  const handleCreateRoom = (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!isAuthenticated) {
      toast.error("Only registered users can create rooms!", {
        duration: TOAST_DURATION.error,
      });
      return;
    }
    const name = newRoomName.trim();
    if (!name) {
      toast("Give your room a cute name first 🧃", {
        duration: TOAST_DURATION.info,
      });
      return;
    }
    const ownerEmail = user.email;
    const ownedRoomsCount = (rooms || []).filter(
      (r) => r.ownerId === ownerEmail
    ).length;
    if (ownedRoomsCount >= 5) {
      toast.error("You can only create up to 5 rooms.", {
        duration: TOAST_DURATION.error,
      });
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
    const toastId = `create-room-${Date.now()}`;
    createToastIdRef.current = toastId;
    toast.loading("Creating room...", { id: toastId });

    // IMPORTANT: set both state and ref so handlers find the pending code
    setPendingRoomCode(code);
    pendingRoomCodeRef.current = code;

    socket.emit("create_room", newRoomPayload);
    setNewRoomName("");
  };

  // ---------- HELPER: attempt to POST to candidate endpoints ----------
  // ---------- HELPER: attempt to POST to candidate endpoints (uses provided headers) ----------
  async function tryPostToJoinEndpoints(body, extraHeaders = {}) {
    const base = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
    const endpoints = [
      `${base}/api/rooms/join`,
      `${base}/api/rooms/join/verify`,
      `${base}/api/join-room`,
      `${base}/rooms/join`,
      `${base}/join/room`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: Object.assign(
            { "Content-Type": "application/json" },
            extraHeaders || {}
          ),
          body: JSON.stringify(body),
          credentials: "include",
        });

        if (res.status === 404) continue;
        if (res.status === 204 || res.status === 202)
          return { ok: true, data: null, url };
        if (!res.ok) continue;

        const json = await res.json().catch(() => null);
        return { ok: true, data: json, url };
      } catch (err) {
        // try next endpoint
        continue;
      }
    }

    return { ok: false, data: null };
  }

  // ---------- JOIN ROOM ----------
  const handleJoinRoom = (code) => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast("Enter a room code first ✨", { duration: TOAST_DURATION.info });
      return;
    }
    socket.emit("verify_room_code", trimmed, async (serverRoom) => {
      if (!serverRoom) {
        toast.error("Room not found. Check the code again.", {
          duration: TOAST_DURATION.error,
        });
        return;
      }
      const roomName = serverRoom.name;

      if (isAuthenticated && user) {
        try {
          const token =
            user?.token || user?.accessToken || user?.authToken || user?.jwt;
          const headers = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;

          const body = {
            code: trimmed,
            userId: user._id || user.id,
            userName: user.name,
          };

          const result = await tryPostToJoinEndpoints(body, headers);
          if (!result.ok) {
            toast.error("Failed to join room.", {
              duration: TOAST_DURATION.error,
            });
            return;
          }

          const joinedRoom = result.data || serverRoom;
          const normalized = normalizeRoom(joinedRoom);

          if (!normalized) {
            toast.error("Failed to join room (invalid server response).", {
              duration: TOAST_DURATION.error,
            });
            return;
          }

          // keep local visibility and storage (your existing behavior)
          // keep local visibility and storage (your existing behavior)
          unhideRoomForMe(normalized.id);
          setRooms((prev) => {
            const filtered = prev.filter((r) => r.id !== normalized.id);
            const next = [...filtered, normalized];

            if (user?.email) {
              const key = getUserRoomsKey(user.email);
              if (key) {
                try {
                  // safe persist using helper to avoid stale overwrite
                  persistRoomToStorage(key, normalized);
                } catch (e) {
                  // fallback: try direct write
                  try {
                    localStorage.setItem(key, JSON.stringify(next));
                  } catch (e2) {}
                }
              }
            }

            return next;
          });

          setSelectedRoomId(normalized.id);
          try {
            localStorage.setItem(LAST_ROOM_KEY, normalized.id);
          } catch (e) {}

          // --- NEW: notify socket server so this socket is associated with the user
          // and actually joins the room for presence/messages. This prevents the server
          // from later filtering the room out of the client's room list.
          try {
            // 1) Ensure socket has user data (so server's filterRoomsForSocket can match)
            socket.emit("register_user", {
              userId: user._id || user.id,
              email: user.email,
            });

            // 2) Ask the socket server to join the room (uses server join_room flow for presence)
            //    server expects the roomId (object id string) — not the numeric code.
            socket.emit("join_room", {
              roomId: normalized.id,
              displayName: user.name || null,
            });

            // 3) Ask server to refresh/send room list for this socket immediately
            socket.emit("request_room_list");
          } catch (sockErr) {
            // not fatal — local state is already updated, but server may not reflect it until later
            console.warn("Socket notifications after join failed:", sockErr);
          }

          toast.success(`Joined room "${normalized.name}" ✅`, {
            duration: TOAST_DURATION.success,
          });
        } catch (err) {
          toast.error("Failed to join room. Please try again.", {
            duration: TOAST_DURATION.error,
          });
        }
      } else {
        // unchanged guest branch
        const existingName = guestName && guestName.trim();
        const cleanName = existingName;
        if (!cleanName) {
          toast.error(
            `Add your name in the "Your name" box before joining "${roomName}".`,
            { duration: TOAST_DURATION.error }
          );
          return;
        }
        let guestId = localStorage.getItem(GUEST_ID_KEY);
        if (!guestId) {
          guestId = `guest_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 8)}`;
          try {
            localStorage.setItem(GUEST_ID_KEY, guestId);
          } catch (e) {}
        }
        try {
          localStorage.setItem(GUEST_NAME_KEY, cleanName);
        } catch (e) {}
        setGuestName(cleanName);
        setIsGuest(true);
        try {
          socket.emit("join_room_guest", {
            code: trimmed,
            name: cleanName,
            guestId,
          });
        } catch (e) {}
        toast.success(`Joining "${roomName}" as ${cleanName} ✨`, {
          duration: TOAST_DURATION.success,
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
        if (key)
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch (e) {}
      } else if (isGuest) {
        try {
          localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
    socket.emit("rename_room", { roomId, newName });
    toast.success("Room renamed ✏️", { duration: TOAST_DURATION.success });
  };

  const deleteRoom = (roomId) => {
    setRooms((prev) => {
      const next = prev.filter((r) => r.id !== roomId);
      if (isAuthenticated && user?.email) {
        const key = getUserRoomsKey(user.email);
        if (key)
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch (e) {}
      } else if (isGuest) {
        try {
          localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
    if (selectedRoomId === roomId) {
      setSelectedRoomId(null);
      try {
        localStorage.removeItem(LAST_ROOM_KEY);
      } catch (e) {}
    }
    socket.emit("delete_room", roomId);
    toast.success("Room deleted 🗑️", { duration: TOAST_DURATION.success });
  };

  const toggleAI = (roomId) => {
    setRooms((prev) => {
      const next = prev.map((r) =>
        r.id === roomId ? { ...r, allowAI: !r.allowAI } : r
      );
      if (isAuthenticated && user?.email) {
        const key = getUserRoomsKey(user.email);
        if (key)
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch (e) {}
      } else if (isGuest) {
        try {
          localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
    socket.emit("toggle_room_ai", roomId);
  };

  const handleGuestExit = () => {
    try {
      localStorage.removeItem(GUEST_ID_KEY);
      localStorage.removeItem(GUEST_NAME_KEY);
      localStorage.removeItem(LAST_ROOM_KEY);
      localStorage.removeItem(GUEST_ROOMS_KEY);
    } catch (e) {}
    setIsGuest(false);
    setGuestName("");
    setRooms([]);
    setSelectedRoomId(null);
    toast.success("Guest session cleared 👋", {
      duration: TOAST_DURATION.success,
    });
    window.location.reload();
  };

  // Exit the **currently selected room**
  const handleExitCurrentRoom = () => {
    if (!selectedRoomId) {
      if (joinCode && joinCode.trim()) {
        const match = rooms.find(
          (r) => String(r.code) === String(joinCode.trim())
        );
        if (match) hideRoomForMe(match.id);
        else
          toast.error("No matching room found to exit.", {
            duration: TOAST_DURATION.error,
          });
      }
      return;
    }

    const room = rooms.find((r) => r.id === selectedRoomId);
    const isOwner =
      isAuthenticated && user?.email && room?.ownerId === user.email;

    if (isOwner) {
      // Owner: Just close the view
      setSelectedRoomId(null);
      try {
        localStorage.removeItem(LAST_ROOM_KEY);
      } catch (e) {}
      try {
        socket.emit("leave_room", { roomId: selectedRoomId });
      } catch (e) {}
    } else {
      // Guest: Completely leave/hide the room
      hideRoomForMe(selectedRoomId);
    }
  };

  /* ---------- Replace existing SettingsMenu with this ---------- */

  /* ---------- DROP-IN REPLACEMENT SettingsMenu ---------- */
  const SettingsMenu = ({ room }) => {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [nameValue, setNameValue] = useState(room.name);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const btnRef = useRef(null);
    const panelRef = useRef(null);
    const [pos, setPos] = useState(null); // { top, left }

    const isOwner =
      isAuthenticated &&
      (room.ownerId === user?.email ||
        String(room.ownerId) === String(user?._id || user?.id));

    if (!isOwner) return null;

    useEffect(() => {
      if (!open) {
        setPos(null);
        return;
      }
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();

      // Align panel's right edge with button's right edge by default
      const panelWidth = 240;
      const left = rect.right - panelWidth;
      const top = rect.bottom + 8;

      // clamp to viewport
      const finalLeft = Math.max(
        8,
        Math.min(left, window.innerWidth - panelWidth - 8)
      );
      const finalTop = Math.max(8, Math.min(top, window.innerHeight - 120));

      setPos({ left: finalLeft, top: finalTop });

      const onDocClick = (e) => {
        if (panelRef.current && panelRef.current.contains(e.target)) return;
        if (btnRef.current && btnRef.current.contains(e.target)) return;
        setOpen(false);
        setConfirmOpen(false);
        setEditing(false);
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          setOpen(false);
          setConfirmOpen(false);
          setEditing(false);
        }
      };

      window.addEventListener("mousedown", onDocClick);
      window.addEventListener("touchstart", onDocClick);
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("mousedown", onDocClick);
        window.removeEventListener("touchstart", onDocClick);
        window.removeEventListener("keydown", onKey);
      };
    }, [open]);

    const stop = (e) => e?.stopPropagation?.();

    const panel = (
      <div
        ref={panelRef}
        onClick={stop}
        className="rounded-lg shadow-2xl text-xs space-y-2"
        style={{
          position: "fixed",
          left: pos?.left ?? 0,
          top: pos?.top ?? 0,
          width: 240,
          zIndex: 99999,
        }}
      >
        {/* Outer box respects dark mode */}
        <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-2">
          {/* Rename / Edit */}
          {!editing ? (
            <button
              onClick={() => {
                setEditing(true);
                setConfirmOpen(false);
                setNameValue(room.name);
              }}
              className="w-full text-left px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center gap-2"
            >
              <span className="text-lg leading-none">✏️</span>
              <span className="ml-1">Rename</span>
            </button>
          ) : (
            <div className="flex gap-2 items-center p-1">
              <input
                className="flex-1 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={() => {
                  const trimmed = nameValue.trim();
                  if (trimmed) renameRoom(room.id, trimmed);
                  setEditing(false);
                  setOpen(false);
                }}
                className="text-green-600 font-semibold px-2"
              >
                ✓
              </button>
            </div>
          )}

          {/* Toggle AI */}
          <button
            onClick={() => {
              toggleAI(room.id);
              setOpen(false);
            }}
            className="w-full text-left px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center gap-2"
          >
            <span className="text-lg leading-none">🤖</span>
            <span className="ml-1">
              {room.allowAI ? "Disable AI" : "Enable AI"}
            </span>
          </button>

          {/* Delete */}
          <div className="mt-1">
            <button
              onClick={() => setConfirmOpen(true)}
              className="w-full text-left px-2 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-600 flex items-center gap-2"
            >
              <span className="text-lg leading-none">🗑</span>
              <span className="ml-1">Delete</span>
            </button>

            {confirmOpen && (
              <div className="mt-2 border rounded p-3 text-sm bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm">
                <p className="mb-2 text-gray-800 dark:text-gray-100">
                  Delete room{" "}
                  <span className="font-semibold">"{room.name}"</span>?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setConfirmOpen(false);
                      setOpen(false);
                    }}
                    className="px-3 py-1 rounded border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      // close immediately then run delete
                      setConfirmOpen(false);
                      setOpen(false);
                      deleteRoom(room.id);
                    }}
                    className="px-3 py-1 rounded bg-red-500 text-white text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );

    return (
      <>
        <div
          className="absolute top-1 right-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            ref={btnRef}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
              setConfirmOpen(false);
              setEditing(false);
              setNameValue(room.name);
            }}
            className={`p-1.5 rounded-full transition ${
              selectedRoomId === room.id
                ? "text-blue-100 hover:bg-blue-500"
                : "text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
            aria-label="Room settings"
          >
            ⚙️
          </button>
        </div>

        {open && pos ? createPortal(panel, document.body) : null}
      </>
    );
  };

  const RoomCard = ({ room }) => (
    <div
      onClick={() => {
        setSelectedRoomId(room.id);
        try {
          localStorage.setItem(LAST_ROOM_KEY, room.id);
        } catch (e) {}
      }}
      className={`relative p-3 rounded-xl cursor-pointer border transition-all flex flex-col justify-between shrink-0 w-full min-h-[80px] ${
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
      {/* LEFT COLUMN: Sidebar */}
      <div
        className={`shrink-0 w-full md:w-80 flex flex-col gap-3 h-full overflow-hidden ${
          selectedRoomId ? "hidden md:flex" : "flex"
        }`}
      >
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
            className={`flex gap-1 items-center ${
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleJoinRoom(joinCode)}
                className="text-green-600 text-xs font-bold px-2 py-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20"
              >
                Join
              </button>
            </div>
          </div>
        </div>
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
            {/* Mobile header: Back + Exit/Leave (works for both logged-in and guest users) */}
            <div className="md:hidden flex items-center justify-between gap-2 pb-2 border-b border-gray-200 dark:border-gray-700 mb-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    try {
                      localStorage.removeItem(LAST_ROOM_KEY);
                    } catch (e) {}
                    setSelectedRoomId(null);
                  }}
                  className="text-sm text-gray-500 dark:text-gray-300 flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
                >
                  ← Back
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Logged-in users (owner or member) */}
                {isAuthenticated ? (
                  // OWNER exit button
                  String(selectedRoom?.ownerId) === String(user?.email) ||
                  String(selectedRoom?.ownerId) === String(user?._id) ||
                  String(selectedRoom?.ownerId) === String(user?.id) ? (
                    <button
                      onClick={handleExitCurrentRoom}
                      className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
                      title="Close chat view"
                    >
                      Close
                    </button>
                  ) : (
                    // MEMBER exit button
                    <button
                      onClick={handleExitCurrentRoom}
                      className="text-xs text-red-500 border border-red-500/50 px-2 py-1 rounded hover:bg-red-500/10"
                      title="Leave this room"
                    >
                      Leave Room
                    </button>
                  )
                ) : (
                  // Guest Exit
                  isGuest && (
                    <button
                      onClick={handleGuestExit}
                      className="text-xs text-red-500 border border-red-500/50 px-2 py-1 rounded hover:bg-red-500/10"
                    >
                      Exit Session
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Desktop Exit Button - Changes based on ownership */}
            <div className="hidden md:flex items-center justify-end gap-2 pb-0">
              {(isAuthenticated &&
                user?.email &&
                String(selectedRoom?.ownerId) === String(user?.email)) ||
              String(selectedRoom?.ownerId) === String(user?._id) ||
              String(selectedRoom?.ownerId) === String(user?.id) ? (
                <button
                  onClick={handleExitCurrentRoom}
                  className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
                  title="Close chat view"
                >
                  Close
                </button>
              ) : (
                <button
                  onClick={handleExitCurrentRoom}
                  className="text-xs text-red-500 border border-red-500/50 px-2 py-1 rounded hover:bg-red-500/10"
                  title="Completely exit & remove room"
                >
                  Leave Room
                </button>
              )}
            </div>

            <div className="shrink-0 p-3 rounded-2xl bg-white dark:bg-gray-900 shadow-lg">
              <div className="w-full">
                <div className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
                  <RoomCall
                    room={selectedRoom}
                    displayName={currentDisplayName}
                  />
                </div>
              </div>
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
