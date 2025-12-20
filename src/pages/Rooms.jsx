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

// const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
// const DEFAULT_JOIN_PATHS = [
//   "/api/rooms/join",
//   "/rooms/join",
//   "/api/rooms/join/verify",
//   "/api/join-room",
//   "/join/room",
// ];

function normalizeRoom(room) {
  if (!room) return null;
  return {
    ...room,
    id: room.id || room._id?.toString() || String(room.code),
  };
}

const persistRoomToStorage = (storageKey, updatedRoom, currentRooms = []) => {
  try {
    const raw = localStorage.getItem(storageKey);
    const stored = raw ? JSON.parse(raw) : null;

    const baseList = Array.isArray(stored)
      ? stored
      : Array.isArray(currentRooms)
      ? currentRooms
      : [];

    const exists = baseList.some(
      (r) => String(r.id) === String(updatedRoom.id)
    );
    const merged = exists
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

  const [pendingRoomCode, setPendingRoomCode] = useState(null);

  const [isGuest, setIsGuest] = useState(() => {
    return !!localStorage.getItem(GUEST_ID_KEY);
  });
  const [guestName, setGuestName] = useState(() => {
    return localStorage.getItem(GUEST_NAME_KEY) || "";
  });

  // NEW: joining spinner state
  const [joining, setJoining] = useState(false);

  // refs for mutable state in socket handlers
  const createToastIdRef = useRef(null);
  const pendingRoomCodeRef = useRef(null);
  const hiddenRoomsRef = useRef([]);

  // refs for auth and user to avoid stale closure issues inside socket handlers
  const userRef = useRef(user);
  const isAuthenticatedRef = useRef(isAuthenticated);

  // hidden rooms state (per-user)
  const [hiddenRooms, setHiddenRooms] = useState([]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;

  // ---------- helper: hidden rooms per user ----------
  function getHiddenKey() {
    if (isAuthenticated && user?.email) return HIDDEN_ROOMS_PREFIX + user.email;
    const guestId = localStorage.getItem(GUEST_ID_KEY) || "anon";
    return HIDDEN_ROOMS_PREFIX + "guest_" + guestId;
  }

  // update both ref and state synchronously so socket handlers see the change immediately
  function saveHiddenRooms(next) {
    const key = getHiddenKey();
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch (e) {
      // ignore
    }
    hiddenRoomsRef.current = next;
    setHiddenRooms(next);
  }

  // load hidden rooms when auth changes (ensures correct key for signed users)
  useEffect(() => {
    try {
      const key = getHiddenKey();
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      const arr = Array.isArray(parsed) ? parsed.map(String) : [];
      hiddenRoomsRef.current = arr;
      setHiddenRooms(arr);
    } catch (e) {
      hiddenRoomsRef.current = [];
      setHiddenRooms([]);
    }
  }, [isAuthenticated, user?.email]);

  function hideRoomForMe(roomId) {
    if (!roomId) return;

    // add to hidden list
    const currentHidden = Array.isArray(hiddenRooms)
      ? hiddenRooms.map(String)
      : [];
    const nextHidden = Array.from(new Set([...currentHidden, String(roomId)]));
    saveHiddenRooms(nextHidden);

    // remove from UI and persisted lists
    setRooms((prev) => {
      const next = prev.filter((r) => String(r.id) !== String(roomId));

      try {
        if (isAuthenticated && user?.email) {
          const key = getUserRoomsKey(user.email);
          if (key) {
            const raw = localStorage.getItem(key);
            if (raw) {
              let parsed;
              try {
                parsed = JSON.parse(raw);
              } catch (e) {
                parsed = [];
              }
              if (Array.isArray(parsed)) {
                const filtered = parsed.filter(
                  (r) => String(r.id) !== String(roomId)
                );
                localStorage.setItem(key, JSON.stringify(filtered));
              }
            }
          }
        } else {
          const rawGuest = localStorage.getItem(GUEST_ROOMS_KEY);
          if (rawGuest) {
            let parsedG;
            try {
              parsedG = JSON.parse(rawGuest);
            } catch (e) {
              parsedG = [];
            }
            if (Array.isArray(parsedG)) {
              const filteredG = parsedG.filter(
                (r) => String(r.id) !== String(roomId)
              );
              localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(filteredG));
            }
          }
        }
      } catch (e) {
        console.warn("hideRoomForMe: failed to update persisted rooms", e);
      }

      return next;
    });

    if (String(selectedRoomId) === String(roomId)) {
      setSelectedRoomId(null);
      try {
        localStorage.removeItem(LAST_ROOM_KEY);
      } catch (e) {}
    }

    try {
      socket.emit("leave_room", { roomId });
    } catch (e) {}

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

  // make sure refs are in sync
  useEffect(() => {
    hiddenRoomsRef.current = hiddenRooms;
    userRef.current = user;
    isAuthenticatedRef.current = isAuthenticated;
  }, [hiddenRooms, user, isAuthenticated]);

  // restore rooms from localStorage (either signed user key or guest list)
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

  // registration (tell socket who we are)
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

  // ---------- Socket listeners ----------
  useEffect(() => {
    const handleUpdate = (serverRooms) => {
      const currentUser = userRef.current;
      const isAuth = isAuthenticatedRef.current;

      // first, normalize and apply hidden filter
      let normalized = applyHiddenFilter(serverRooms);

      // --- MERGE locally-stored rooms for this user (robustness) ---
      // This ensures that if a signed user joined a room and the server didn't
      // include it in the room_list_update (yet), the client still shows it.
      try {
        const storageKey = localStorage.getItem(GUEST_ID_KEY)
          ? GUEST_ROOMS_KEY
          : isAuth && currentUser?.email
          ? getUserRoomsKey(currentUser.email)
          : null;

        if (storageKey) {
          const raw = localStorage.getItem(storageKey) || "[]";
          const parsed = JSON.parse(raw);
          const storedRooms = Array.isArray(parsed)
            ? parsed.map(normalizeRoom).filter(Boolean)
            : [];

          // Add storedRooms into normalized list if missing (prefer server object when present)
          const normalizedById = new Map(
            normalized.map((r) => [String(r.id), r])
          );
          for (const sr of storedRooms) {
            if (!sr || !sr.id) continue;
            if (!normalizedById.has(String(sr.id))) {
              // Only add if not hidden (applyHiddenFilter already removed hidden ones)
              normalized.push(sr);
            } else {
              // merge: prefer server room but ensure we keep meaningful fields from stored room
              const serverRoom = normalizedById.get(String(sr.id));
              normalizedById.set(String(sr.id), { ...sr, ...serverRoom });
            }
          }
          // if normalizedById changed, rebuild normalized array (but keep original order from server)
          // We'll just ensure duplicate ids are removed:
          const seen = new Set();
          normalized = normalized.filter((r) => {
            const id = String(r.id);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        }
      } catch (e) {
        // ignore merge errors
        console.warn("Failed merging stored rooms into server rooms:", e);
      }

      // compute membership set from stored data (synchronous localStorage read for reliability)
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

      // additionally, if signed in, inspect server room members/owner fields to determine membership
      if (isAuth && currentUser?.email && Array.isArray(normalized)) {
        const email = currentUser.email;
        const uid = currentUser._id || currentUser.id;
        normalized.forEach((r) => {
          try {
            if (!r) return;
            if (r.ownerId && String(r.ownerId) === String(email)) {
              myJoinedRoomIds.add(String(r.id));
              return;
            }
            if (Array.isArray(r.members)) {
              const found = r.members.some((m) => {
                if (!m) return false;
                const mid = m.id ?? m.userId ?? m._id ?? m.email;
                return (
                  String(mid) === String(email) ||
                  String(mid) === String(uid) ||
                  String(m?.id) === String(email)
                );
              });
              if (found) myJoinedRoomIds.add(String(r.id));
            }
          } catch (e) {}
        });
      }

      // Keep only rooms where user is owner or has joined
      normalized = normalized.filter((room) => {
        const isOwner =
          isAuth && currentUser?.email && room.ownerId === currentUser.email;
        const hasJoined = myJoinedRoomIds.has(String(room.id));
        return isOwner || hasJoined;
      });

      // update UI list + persist to localStorage
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

      // pending room creation handling (unchanged)
      if (pendingRoomCodeRef.current) {
        const codeToFind = String(pendingRoomCodeRef.current);
        const byCode = normalized.find((r) => String(r.code) === codeToFind);

        if (byCode) {
          setTimeout(() => {
            try {
              localStorage.setItem(LAST_ROOM_KEY, byCode.id);
            } catch (e) {}

            if (createToastIdRef.current) {
              try {
                toast.dismiss(createToastIdRef.current);
              } catch (e) {}
              createToastIdRef.current = null;
            }

            toast.success(`Room "${byCode.name}" created 🎉`, {
              duration: TOAST_DURATION.success,
            });

            setPendingRoomCode(null);
            pendingRoomCodeRef.current = null;

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

      // NEW: stop spinner when guest successfully joined
      try {
        setJoining(false);
      } catch (e) {}
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

      // ensure spinner is hidden on failure (safe)
      try {
        setJoining(false);
      } catch (e) {}
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

  // Clear when logged out
  useEffect(() => {
    if (!isAuthenticated && !isGuest) {
      setRooms([]);
      setSelectedRoomId(null);
      setGuestName("");
    }
  }, [isAuthenticated, isGuest, setRooms]);

  // Presence join/leave
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

  // CREATE ROOM
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

    setPendingRoomCode(code);
    pendingRoomCodeRef.current = code;

    socket.emit("create_room", newRoomPayload);
    setNewRoomName("");
  };

  // try POST to join endpoints
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
        continue;
      }
    }

    return { ok: false, data: null };
  }

  // JOIN ROOM
  const handleJoinRoom = (code) => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast("Enter a room code first ✨", { duration: TOAST_DURATION.info });
      return;
    }

    // Show spinner as soon as join is initiated
    setJoining(true);

    socket.emit("verify_room_code", trimmed, async (serverRoom) => {
      try {
        if (!serverRoom) {
          toast.error("Room not found. Check the code again.", {
            duration: TOAST_DURATION.error,
          });
          setJoining(false);
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

            // Try REST join first (best-effort)
            const result = await tryPostToJoinEndpoints(body, headers);

            const socketJoinPayload = {
              code: trimmed,
              userId: user._id || user.id,
              email: user.email || null,
              userName: user.name || user.email,
            };

            const applyJoinedRoomToUI = (joinedRoomObj) => {
              const normalized = normalizeRoom(joinedRoomObj);
              if (!normalized) {
                toast.error("Failed to join room (invalid server response).", {
                  duration: TOAST_DURATION.error,
                });
                setJoining(false);
                return;
              }

              // unhide & persist locally (signed user)
              unhideRoomForMe(normalized.id);
              setRooms((prev) => {
                const filtered = prev.filter((r) => r.id !== normalized.id);
                const next = [...filtered, normalized];

                if (user?.email) {
                  const key = getUserRoomsKey(user.email);
                  if (key) {
                    try {
                      persistRoomToStorage(key, normalized, prev);
                    } catch (e) {
                      try {
                        localStorage.setItem(key, JSON.stringify(next));
                      } catch (ee) {}
                    }
                  }
                }

                try {
                  localStorage.setItem(LAST_ROOM_KEY, normalized.id);
                } catch (e) {}
                return next;
              });

              setSelectedRoomId(normalized.id);
              toast.success(`Joined room "${normalized.name}" ✅`, {
                duration: TOAST_DURATION.success,
              });

              // NEW: hide spinner on success
              setJoining(false);
            };

            let socketJoinTried = false;
            try {
              if (socket && socket.emit) {
                socketJoinTried = true;
                socket.emit(
                  "join_room_authenticated",
                  socketJoinPayload,
                  (resp) => {
                    try {
                      if (resp && resp.ok && resp.room) {
                        applyJoinedRoomToUI(resp.room);
                        try {
                          socket.emit("request_room_list");
                        } catch {}
                        return;
                      } else {
                        const joinedRoom = result.data || serverRoom;
                        applyJoinedRoomToUI(joinedRoom);
                        try {
                          socket.emit("register_user", {
                            userId: user._id || user.id,
                            email: user.email,
                          });
                          socket.emit("join_room", {
                            roomId:
                              (result.data &&
                                (result.data.id || result.data._id)) ||
                              serverRoom._id ||
                              serverRoom.id ||
                              serverRoom.code,
                            displayName: user.name || user.email || null,
                          });
                          socket.emit("request_room_list");
                        } catch {}
                        return;
                      }
                    } catch (cbErr) {
                      // ensure spinner removed if callback throws
                      setJoining(false);
                      console.error(
                        "join_room_authenticated callback error",
                        cbErr
                      );
                    }
                  }
                );
              }
            } catch (sockErr) {
              socketJoinTried = false;
            }

            if (!socketJoinTried) {
              if (!result.ok) {
                toast.error("Failed to join room.", {
                  duration: TOAST_DURATION.error,
                });
                setJoining(false);
                return;
              }
              const joinedRoom = result.data || serverRoom;
              applyJoinedRoomToUI(joinedRoom);
            }
          } catch (err) {
            toast.error("Failed to join room. Please try again.", {
              duration: TOAST_DURATION.error,
            });
            setJoining(false);
          }
        } else {
          // Guest flow unchanged
          const existingName = guestName && guestName.trim();
          const cleanName = existingName;
          if (!cleanName) {
            toast.error(
              `Add your name in the "Your name" box before joining "${roomName}".`,
              { duration: TOAST_DURATION.error }
            );
            setJoining(false);
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
            // guest join is async; spinner will be dismissed in the
            // 'guest_joined_success' socket handler above when server confirms.
            socket.emit("join_room_guest", {
              code: trimmed,
              name: cleanName,
              guestId,
            });
          } catch (e) {
            // if emit fails, hide spinner to avoid stuck state
            setJoining(false);
          }
          toast.success(`Joining "${roomName}" as ${cleanName} ✨`, {
            duration: TOAST_DURATION.success,
          });
        }
      } catch (outerErr) {
        console.error("verify_room_code flow error", outerErr);
        toast.error("An error occurred while joining. Try again.", {
          duration: TOAST_DURATION.error,
        });
        setJoining(false);
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

  // leaveRoomView (don't hide room)
  const leaveRoomView = () => {
    if (!selectedRoomId) return;

    if (!isAuthenticated) {
      try {
        unhideRoomForMe(selectedRoomId);

        const roomObj = rooms.find(
          (r) => String(r.id) === String(selectedRoomId)
        ) ||
          selectedRoom || {
            id: selectedRoomId,
            name: "Room",
            code: selectedRoomId,
          };

        try {
          const raw = localStorage.getItem(GUEST_ROOMS_KEY);
          const parsed = raw ? JSON.parse(raw) : [];
          const arr = Array.isArray(parsed) ? parsed : [];
          const exists = arr.some(
            (r) => String(r.id) === String(selectedRoomId)
          );
          if (!exists) {
            arr.push(roomObj);
            localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(arr));
          } else {
            const updated = arr.map((r) =>
              String(r.id) === String(selectedRoomId) ? { ...r, ...roomObj } : r
            );
            localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify(updated));
          }
        } catch (e) {
          try {
            localStorage.setItem(GUEST_ROOMS_KEY, JSON.stringify([roomObj]));
          } catch (ee) {
            console.warn("leaveRoomView: failed to persist guest room", ee);
          }
        }

        setRooms((prev) => {
          if (prev.some((r) => String(r.id) === String(selectedRoomId)))
            return prev;
          return [...prev, roomObj];
        });

        // DO NOT remove LAST_ROOM_KEY here on purpose (keeps guest restore stable)
        setSelectedRoomId(null);
      } catch (err) {
        console.warn("leaveRoomView (guest) error:", err);
        setSelectedRoomId(null);
      }
      return;
    }

    // authenticated: leave view and clear LAST_ROOM_KEY
    try {
      socket.emit("leave_room", { roomId: selectedRoomId });
    } catch (e) {}
    setSelectedRoomId(null);
    try {
      localStorage.removeItem(LAST_ROOM_KEY);
    } catch (e) {}
  };

  // exit current room: owner => close view; others => hide
  const handleExitCurrentRoom = () => {
    if (!selectedRoomId) {
      if (joinCode && joinCode.trim()) {
        const match = rooms.find(
          (r) => String(r.code) === String(joinCode.trim())
        );
        if (match) {
          hideRoomForMe(match.id);
        } else {
          toast.error("No matching room found to exit.", {
            duration: TOAST_DURATION.error,
          });
        }
      }
      return;
    }

    const room =
      rooms.find((r) => r.id === selectedRoomId) || selectedRoom || null;
    const isOwner = !!(
      isAuthenticated &&
      user?.email &&
      room &&
      String(room.ownerId) === String(user.email)
    );

    if (isOwner) {
      setSelectedRoomId(null);
      try {
        localStorage.removeItem(LAST_ROOM_KEY);
      } catch (e) {}
      try {
        socket.emit("leave_room", { roomId: selectedRoomId });
      } catch (e) {
        console.warn("socket leave_room failed:", e);
      }
      return;
    }

    try {
      hideRoomForMe(selectedRoomId);
    } catch (err) {
      console.warn("handleExitCurrentRoom hideRoomForMe failed:", err);
      setSelectedRoomId(null);
      try {
        localStorage.removeItem(LAST_ROOM_KEY);
      } catch (e) {}
    }
  };

  /* ---------- SettingsMenu component ---------- */
  const SettingsMenu = ({ room }) => {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [nameValue, setNameValue] = useState(room.name);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const btnRef = useRef(null);
    const panelRef = useRef(null);
    const [pos, setPos] = useState(null);

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
      const panelWidth = 240;
      const left = rect.right - panelWidth;
      const top = rect.bottom + 8;
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
        <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-2">
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
    <div className="h-[calc(100dvh-64px)] w-full flex flex-col lg:flex-row gap-4 p-2 lg:p-4 max-w-7xl mx-auto overflow-hidden">
      {/* Spinner overlay portal */}
      {joining &&
        createPortal(
          <div className="fixed inset-0 z-[999999] flex items-center justify-center pointer-events-auto">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
            <div className="relative z-50 flex flex-col items-center gap-3 p-6 rounded-lg bg-white dark:bg-gray-900 shadow-2xl">
              <div className="w-14 h-14 rounded-full border-4 border-t-transparent animate-spin border-blue-600"></div>
              <div className="text-sm text-gray-800 dark:text-gray-100 font-medium">
                Joining room...
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* LEFT COLUMN: Sidebar */}
      <div
        className={`shrink-0 w-full lg:w-80 flex flex-col gap-3 h-full overflow-hidden ${
          selectedRoomId ? "hidden lg:flex" : "flex"
        }`}
      >
        <div className="shrink-0 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {isAuthenticated ? "New Room" : "Guest Join"}
            </h3>
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
          !selectedRoomId ? "hidden lg:flex" : "flex"
        }`}
      >
        {selectedRoom ? (
          <>
            {/* Mobile header */}
            <div className="lg:hidden flex items-center justify-between gap-2 pb-2 border-b border-gray-200 dark:border-gray-700 mb-1">
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
                {isAuthenticated ? (
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
                    <>
                      <button
                        onClick={leaveRoomView}
                        className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
                        title="Leave this room view"
                      >
                        Leave Room
                      </button>
                      <button
                        onClick={() => hideRoomForMe(selectedRoomId)}
                        className="text-xs text-red-500 border border-red-500/50 px-2 py-1 rounded hover:bg-red-500/10"
                        title="Completely exit & remove room"
                      >
                        Exit
                      </button>
                    </>
                  )
                ) : (
                  isGuest && (
                    <>
                      <button
                        onClick={leaveRoomView}
                        className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
                        title="Leave this room view"
                      >
                        Leave Room
                      </button>
                      <button
                        onClick={() => hideRoomForMe(selectedRoomId)}
                        className="text-xs text-red-500 border border-red-500/50 px-2 py-1 rounded hover:bg-red-500/10"
                      >
                        Exit
                      </button>
                    </>
                  )
                )}
              </div>
            </div>

            {/* Desktop header */}
            <div className="hidden lg:flex items-center justify-end gap-2 pb-0">
              {isAuthenticated &&
              user?.email &&
              String(selectedRoom?.ownerId) === String(user?.email) ? (
                <button
                  onClick={handleExitCurrentRoom}
                  className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
                  title="Close chat view"
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    onClick={leaveRoomView}
                    className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
                    title="Leave this room view"
                  >
                    Leave Room
                  </button>
                  <button
                    onClick={() => hideRoomForMe(selectedRoomId)}
                    className="text-xs text-red-500 border border-red-500/50 px-2 py-1 rounded hover:bg-red-500/10"
                    title="Completely exit & remove room"
                  >
                    Exit
                  </button>
                </>
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
