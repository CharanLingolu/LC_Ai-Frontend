// src/components/RoomChat.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { callLCai } from "../utils/aiClient";
import { socket } from "../socket";

const INPUT_EMOJIS = ["❤️", "😀", "😂", "😢", "🔥", "👍", "🙏"];
const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "🔥", "😢"];

const ROOM_THEMES = [
  { id: "default", label: "Default" },
  { id: "love", label: "Love" },
  { id: "midnight", label: "Midnight" },
  { id: "sunset", label: "Sunset" },
];

export default function RoomChat({ room, displayName }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const messagesEndRef = useRef(null);

  const [typingUser, setTypingUser] = useState(null);
  const typingTimeoutRef = useRef(null);

  const [activeReactionMessageId, setActiveReactionMessageId] = useState(null);
  const longPressTimerRef = useRef(null);

  // 🔹 Normalize backend room _id into a clean string
  let backendRoomId = null;
  if (typeof room._id === "string") {
    backendRoomId = room._id;
  } else if (room._id && typeof room._id === "object") {
    if (typeof room._id.toString === "function") {
      backendRoomId = room._id.toString();
    } else if (room._id.$oid) {
      backendRoomId = room._id.$oid;
    } else {
      backendRoomId = String(room._id);
    }
  }

  // This is the id we use for socket rooms / UI
  const roomId = backendRoomId || room.id || room.code;
  const hasBackendRoom = !!backendRoomId;

  const currentUserName = displayName || user?.name || "Guest";
  const currentUserId = user?._id || user?.id || null;
  const isGuest = !currentUserId; // (not used in logic, but kept if you need it later)

  const reactionUserId = currentUserId || `guest_${currentUserName || "Guest"}`;
  const reactionDisplayName = currentUserName || "Guest";

  const roomThemeKey = `lc_ai_room_theme_${roomId || "unknown"}`;

  const [currentTheme, setCurrentTheme] = useState(() => {
    const saved = roomId ? localStorage.getItem(roomThemeKey) : null;
    return saved || room.theme || "default";
  });

  // 🔹 Local AI enabled state (so guests don't depend on refreshing room object)
  const [allowAI, setAllowAI] = useState(!!room.allowAI);

  // Keep allowAI in sync when the room prop changes (e.g. owner side)
  useEffect(() => {
    setAllowAI(!!room.allowAI);
  }, [room.allowAI, roomId]);

  // When changing rooms, reload saved theme for that room
  useEffect(() => {
    if (!roomId) return;
    const saved = localStorage.getItem(roomThemeKey);
    if (saved) {
      setCurrentTheme(saved);
    } else if (room.theme) {
      setCurrentTheme(room.theme);
    } else {
      setCurrentTheme("default");
    }
  }, [roomId, room.theme, roomThemeKey]);

  // BACKGROUND
  const themeClass = useMemo(() => {
    switch (currentTheme) {
      case "love":
        return "chat-theme-love";
      case "midnight":
        return "chat-theme-midnight";
      case "sunset":
        return "chat-theme-sunset";
      default:
        return "chat-theme-default";
    }
  }, [currentTheme]);

  // BUBBLES
  const bubbleStyles = useMemo(() => {
    switch (currentTheme) {
      case "love":
        return {
          me: "bg-gradient-to-r from-fuchsia-700 via-pink-600 to-rose-600 text-white border border-pink-200/80 shadow-[0_0_22px_rgba(236,72,153,0.9)]",
          ai: "bg-gradient-to-r from-violet-700 via-purple-700 to-fuchsia-700 text-fuchsia-50 border border-fuchsia-200/80 shadow-[0_0_22px_rgba(168,85,247,0.95)]",
          other:
            "bg-slate-900/95 text-rose-100 border border-rose-200/80 shadow-[0_0_18px_rgba(15,23,42,0.95)]",
        };
      case "midnight":
        return {
          me: "bg-blue-900 text-white border border-blue-700 shadow-md shadow-blue-900/60",
          ai: "bg-purple-900 text-purple-100 border border-purple-700 shadow-md shadow-purple-900/60",
          other:
            "bg-gray-700 text-gray-100 border border-gray-500 shadow-md shadow-black/40",
        };
      case "sunset":
        return {
          me: "bg-gradient-to-r from-orange-700 via-amber-600 to-rose-600 text-white border border-orange-200/80 shadow-[0_0_24px_rgba(251,146,60,0.95)]",
          ai: "bg-gradient-to-r from-rose-700 via-pink-600 to-fuchsia-600 text-pink-50 border border-rose-200/80 shadow-[0_0_24px_rgba(244,114,182,0.95)]",
          other:
            "bg-slate-950/90 text-amber-100 border border-amber-300/80 shadow-[0_0_20px_rgba(15,23,42,0.95)]",
        };
      default:
        return {
          me: "bg-blue-600 text-white",
          ai: "bg-purple-500 text-purple-50 border border-purple-300",
          other: "bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100",
        };
    }
  }, [currentTheme]);

  const showTyping = (name) => {
    if (!name) return;
    setTypingUser(name);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 1500);
  };

  // auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, aiThinking]);

  // history + socket
  useEffect(() => {
    if (!roomId) return;

    const loadHistory = async () => {
      if (!hasBackendRoom || !backendRoomId) {
        setMessages([]);
        return;
      }
      try {
        const res = await fetch(
          `http://localhost:5000/api/rooms/${backendRoomId}/messages`
        );
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("History load error", err);
        setMessages([]);
      }
    };

    loadHistory();

    socket.emit("join_room", {
      roomId,
      displayName: currentUserName,
    });

    const handleReceive = (msg) => {
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), msg]);
    };

    const handleSystem = (msg) => {
      const systemMsg = {
        _id: `sys-${Date.now()}-${Math.random()}`,
        roomId,
        text: msg.content,
        role: "system",
        senderGuestName: "System",
        createdAt: msg.timestamp || new Date().toISOString(),
      };

      setMessages((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const last = safePrev[safePrev.length - 1];
        if (last && last.role === "system" && last.text === systemMsg.text) {
          return safePrev;
        }
        return [...safePrev, systemMsg];
      });
    };

    const handleTyping = ({ roomId: incomingRoomId, displayName }) => {
      if (incomingRoomId !== roomId) return;
      showTyping(displayName);
    };

    const handleReactionUpdated = ({ messageId, reactions }) => {
      setMessages((prev) =>
        (prev || []).map((m) => (m._id === messageId ? { ...m, reactions } : m))
      );
    };

    const handleThemeChanged = ({ roomId: changedId, theme }) => {
      if (changedId === roomId) {
        const next = theme || "default";
        setCurrentTheme(next);
        localStorage.setItem(roomThemeKey, next);
      }
    };

    // 🔹 handle AI toggled event
    const handleAiToggled = ({ roomId: changedId, allowAI }) => {
      if (changedId !== roomId) return;
      setAllowAI(!!allowAI);
    };

    socket.on("receive_message", handleReceive);
    socket.on("system_message", handleSystem);
    socket.on("typing", handleTyping);
    socket.on("reactionUpdated", handleReactionUpdated);
    socket.on("room_theme_changed", handleThemeChanged);
    socket.on("room_ai_toggled", handleAiToggled);

    return () => {
      socket.off("receive_message", handleReceive);
      socket.off("system_message", handleSystem);
      socket.off("typing", handleTyping);
      socket.off("reactionUpdated", handleReactionUpdated);
      socket.off("room_theme_changed", handleThemeChanged);
      socket.off("room_ai_toggled", handleAiToggled);
      socket.emit("leave_room", { roomId });
    };
  }, [roomId, backendRoomId, hasBackendRoom, currentUserName, roomThemeKey]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !roomId) return;

    setInput("");
    setTypingUser(null);

    const payload = {
      roomId,
      text,
      senderUserId: currentUserId,
      senderGuestName: currentUserName,
      role: "user",
    };

    socket.emit("send_message", payload);

    // 🔹 Use local allowAI instead of room.allowAI
    if (allowAI) {
      setAiThinking(true);
      try {
        const historyForAI = messages.map((m) => ({
          role: m.role === "ai" ? "assistant" : "user",
          content: `${m.senderGuestName || ""}: ${m.text}`,
        }));
        historyForAI.push({
          role: "user",
          content: `${currentUserName}: ${text}`,
        });

        const aiReply = await callLCai("room", historyForAI);

        const aiPayload = {
          roomId,
          text: aiReply.content,
          senderUserId: null,
          senderGuestName: "LC_Ai 🤖",
          role: "ai",
        };

        socket.emit("send_message", aiPayload);
      } catch (err) {
        console.error("AI Error:", err);
        setMessages((prev) => [
          ...(Array.isArray(prev) ? prev : []),
          {
            _id: `err-${Date.now()}`,
            role: "system",
            text: "⚠️ AI is currently overloaded.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setAiThinking(false);
      }
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);

    if (!roomId) return;

    if (value.trim()) {
      socket.emit("typing", {
        roomId,
        displayName: currentUserName,
      });
    } else {
      setTypingUser(null);
    }
  };

  const handleEmojiClick = (emoji) => {
    setInput((prev) => prev + emoji);
  };

  const handleReactionClick = (messageId, emoji) => {
    if (!messageId) return;

    socket.emit("addReaction", {
      messageId,
      emoji,
      userId: reactionUserId,
      displayName: reactionDisplayName,
    });
  };

  const handleThemeChange = (themeId) => {
    setCurrentTheme(themeId);
    localStorage.setItem(roomThemeKey, themeId);
    if (!roomId) return;

    socket.emit("change_room_theme", {
      roomId,
      theme: themeId,
      changedBy: currentUserName,
    });
  };

  const handleMediaClick = () => {
    alert("Media upload will be available soon.");
  };

  const startLongPress = (messageId) => {
    if (!messageId) return;

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(
      () => setActiveReactionMessageId(messageId),
      350
    );
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <div
      className={`flex flex-col h-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm chat-themable-container room-chat-container ${themeClass}`}
    >
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/70 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="min-w-0">
          <h2 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-1 sm:gap-2">
            <span className="truncate max-w-[180px] sm:max-w-[260px]">
              {room.name}
            </span>
            {allowAI && (
              <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[9px] sm:text-[10px] rounded-full whitespace-nowrap">
                AI Enabled
              </span>
            )}
          </h2>
          <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            Code: {room.code}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-start sm:justify-end gap-1 max-w-full">
          {ROOM_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleThemeChange(t.id)}
              className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] border transition
                ${
                  currentTheme === t.id
                    ? "bg-white/80 dark:bg-gray-800 text-slate-900 dark:text-slate-100 border-blue-500"
                    : "bg-white/40 dark:bg-gray-900/40 text-slate-600 dark:text-slate-300 border-transparent hover:border-blue-300"
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 min-h-0 chat-messages-area">
        {Array.isArray(messages) &&
          messages.map((m, index) => {
            const key = m._id || `${m.createdAt}-${index}`;
            const uiId = m._id || key;

            const isMe =
              m.senderGuestName === currentUserName &&
              m.role !== "ai" &&
              m.role !== "system";
            const isAi = m.role === "ai";
            const isSystem = m.role === "system";

            const timeLabel = m.createdAt
              ? new Date(m.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";

            const reactionsByEmoji = (m.reactions || []).reduce((acc, r) => {
              const k = r.emoji;
              if (!acc[k]) {
                acc[k] = { count: 0, names: [] };
              }
              acc[k].count += 1;
              if (r.displayName) acc[k].names.push(r.displayName);
              return acc;
            }, {});

            if (isSystem) {
              return (
                <div key={key} className="flex justify-center my-2">
                  <span className="bg-gray-200/90 dark:bg-gray-700/80 text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 italic">
                    {m.text}
                  </span>
                </div>
              );
            }

            const bubbleClass = isMe
              ? bubbleStyles.me
              : isAi
              ? bubbleStyles.ai
              : bubbleStyles.other;

            return (
              <div
                key={key}
                className={`flex w-full ${
                  isMe ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex flex-col max-w-[85%] md:max-w-[70%] ${
                    isMe ? "items-end" : "items-start"
                  }`}
                >
                  {!isMe && (
                    <span className="text-[10px] text-white/90 ml-1 mb-1">
                      {m.senderGuestName}
                    </span>
                  )}

                  <div
                    className={`px-3 py-2 text-xs sm:text-sm shadow-sm break-words cursor-pointer select-none rounded-2xl ${bubbleClass} ${
                      isMe ? "rounded-tr-none" : "rounded-tl-none"
                    }`}
                    onMouseDown={() => startLongPress(uiId)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={() => startLongPress(uiId)}
                    onTouchEnd={cancelLongPress}
                  >
                    <span
                      className={
                        currentTheme === "love"
                          ? "glow-text-love"
                          : currentTheme === "sunset"
                          ? "glow-text-sunset"
                          : ""
                      }
                    >
                      {m.text}
                    </span>
                  </div>

                  <div className="flex items-center flex-wrap gap-2 mt-1 mx-1">
                    {timeLabel && (
                      <span className="text-[9px] text-slate-100">
                        {timeLabel}
                      </span>
                    )}

                    {Object.keys(reactionsByEmoji).length > 0 && (
                      <div className="flex gap-1 text-[10px] bg-black/25 px-1.5 py-0.5 rounded-full">
                        {Object.entries(reactionsByEmoji).map(
                          ([emoji, info]) => (
                            <span
                              key={emoji}
                              className="flex items-center"
                              title={info.names.join(", ")}
                            >
                              <span className="mr-0.5">{emoji}</span>
                              <span className="text-[9px] text-slate-100">
                                {info.count}
                              </span>
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>

                  {activeReactionMessageId === uiId && (
                    <div className="mt-1 flex flex-wrap gap-1 text-xs bg-black/25 px-2 py-1 rounded-full">
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            if (m._id) {
                              handleReactionClick(m._id, emoji);
                            }
                            setActiveReactionMessageId(null);
                          }}
                          className="px-1 rounded hover:bg-black/20"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {aiThinking && (
          <div className="flex justify-start w-full">
            <div className="bg-black/25 text-white text-xs px-3 py-2 rounded-2xl rounded-tl-none border border-white/40 shadow-md">
              LC_Ai is thinking...
            </div>
          </div>
        )}

        {typingUser && (
          <div className="text-[11px] text-slate-100 italic ml-1">
            {typingUser} is typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="p-2 sm:p-3 bg-black/40 dark:bg-gray-900/90 border-t border-gray-200/30 dark:border-gray-700 shrink-0 chat-input-area"
      >
        <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-2 text-lg sm:text-xl">
          <button
            type="button"
            onClick={handleMediaClick}
            className="px-2 py-1 text-xs sm:text-sm rounded-lg border border-gray-200/40 dark:border-gray-700 bg-black/30 dark:bg-gray-800 hover:bg-black/40 dark:hover:bg-gray-700 text-gray-100"
          >
            📎
          </button>
          {INPUT_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => handleEmojiClick(em)}
              className="px-1 rounded hover:bg-black/20 dark:hover:bg-gray-700"
            >
              {em}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200/40 dark:border-gray-700 bg-black/40 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500/70 transition-all placeholder:text-gray-400 text-slate-100"
            placeholder={`Message ${room.name}...`}
            value={input}
            onChange={handleInputChange}
          />
          <button
            type="submit"
            disabled={!input.trim() || aiThinking}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center"
          >
            <svg
              className="w-5 h-5 transform rotate-90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
