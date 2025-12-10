// src/pages/FriendMode.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { callLCai } from "../utils/aiClient.js";

const STORAGE_KEY_PREFIX = "lc_ai_friend_history_";
const THEME_STORAGE_KEY = "lc_ai_friend_theme";

const INPUT_EMOJIS = ["❤️", "😀", "😂", "😢", "🔥", "👍", "🙏"];
const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "🔥", "😢"];

const THEMES = [
  { id: "default", label: "Default" },
  { id: "love", label: "Love" },
  { id: "midnight", label: "Midnight" },
  { id: "sunset", label: "Sunset" },
];

function getStorageKey(user, isAuthenticated) {
  if (!isAuthenticated || !user?.email) return null;
  return STORAGE_KEY_PREFIX + user.email;
}

function makeInitialMessage(name) {
  const now = new Date().toISOString();
  return {
    id: `init-${Date.now()}`,
    role: "assistant",
    text: name
      ? `Hey ${name}! 👋 I’m LC_Ai, your AI friend. What’s up?`
      : "Hey! 👋 I’m LC_Ai, your AI friend. What’s up?",
    createdAt: now,
    reactions: [],
  };
}

export default function FriendMode() {
  const { user, token, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved || "default";
  });

  const [activeReactionMessageId, setActiveReactionMessageId] = useState(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const reactionOpenedAtRef = useRef(0);
  const messagesContainerRef = useRef(null);

  // ---------- Toast system ----------
  const [toasts, setToasts] = useState([]);
  const DEFAULT_TOAST_MS = 1400;
  const SUCCESS_TOAST_MS = 2000;

  const addToast = (message, type = "info", duration = DEFAULT_TOAST_MS) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, duration);
  };
  // -----------------------------------

  // ---------- THEME BACKGROUND ----------
  const themeClass = useMemo(() => {
    switch (theme) {
      case "love":
        return "chat-theme-love";
      case "midnight":
        return "chat-theme-midnight";
      case "sunset":
        return "chat-theme-sunset";
      default:
        return "chat-theme-default";
    }
  }, [theme]);

  // ---------- THEME BUBBLE STYLES ----------
  const bubbleStyles = useMemo(() => {
    switch (theme) {
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
          other:
            "bg-gray-200 text-slate-900 dark:bg-gray-800 dark:text-slate-100",
        };
    }
  }, [theme]);

  // 1️⃣ Load saved conversation
  useEffect(() => {
    const key = getStorageKey(user, isAuthenticated);

    if (!key) {
      setMessages([makeInitialMessage(user?.name)]);
      return;
    }

    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      } catch {}
    }

    setMessages([makeInitialMessage(user?.name)]);
  }, [user?.email, user?.name, isAuthenticated]);

  // 2️⃣ Save conversation
  useEffect(() => {
    const key = getStorageKey(user, isAuthenticated);
    if (!key) return;
    if (!messages || messages.length === 0) return;
    localStorage.setItem(key, JSON.stringify(messages));
  }, [messages, user?.email, isAuthenticated]);

  // 3️⃣ Auto-scroll
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, loading]);

  // 4️⃣ Reaction-bar scroll
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeReactionMessageId]);

  // 5️⃣ Close reaction bar on outside tap — SAME AS RoomChat
  useEffect(() => {
    if (!activeReactionMessageId) return;

    const handleOutsideTap = (e) => {
      if (e.target.closest("[data-reaction-bar='true']")) return;

      if (Date.now() - reactionOpenedAtRef.current < 400) return;

      setActiveReactionMessageId(null);
    };

    document.addEventListener("click", handleOutsideTap);
    document.addEventListener("touchstart", handleOutsideTap);

    return () => {
      document.removeEventListener("click", handleOutsideTap);
      document.removeEventListener("touchstart", handleOutsideTap);
    };
  }, [activeReactionMessageId]);

  function buildMessagesForAPI(conversation) {
    const core = conversation.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.text,
    }));

    if (user?.name) {
      core.unshift({
        role: "user",
        content: `For this whole conversation, remember that my name is ${user.name}.`,
      });
    }

    return core;
  }

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const now = new Date().toISOString();
    const userMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      createdAt: now,
      reactions: [],
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // small toast to indicate send
    addToast("Message sent", "info", DEFAULT_TOAST_MS);

    try {
      const reply = await callLCai(
        "friend",
        buildMessagesForAPI(newMessages),
        token
      );

      const replyMsg = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: reply.content,
        createdAt: new Date().toISOString(),
        reactions: [],
      };

      setMessages((prev) => [...prev, replyMsg]);
      addToast("LC_Ai replied", "success", SUCCESS_TOAST_MS);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: "Oops, I couldn't respond. Try again?",
          createdAt: new Date().toISOString(),
          reactions: [],
        },
      ]);
      addToast("Couldn't get a reply. Try again.", "error", SUCCESS_TOAST_MS);
    } finally {
      setLoading(false);
    }
  };

  const handleEmojiClick = (emoji) => {
    setInput((prev) => prev + emoji);
  };

  const handleThemeChange = (id) => {
    setTheme(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
    const themeObj = THEMES.find((t) => t.id === id);
    addToast(
      `${(themeObj && themeObj.label) || id} theme applied`,
      "success",
      DEFAULT_TOAST_MS
    );
  };

  // ONE reaction per message
  const handleReactionClick = (messageId, emoji) => {
    setActiveReactionMessageId(null);

    // inspect current message to decide toast text
    const target = messages.find((m) => m.id === messageId);
    const existing = target?.reactions?.find((r) => r.userId === "me");

    let toastText = "Reaction added";
    if (existing) {
      if (existing.emoji === emoji) {
        toastText = "Reaction removed";
      } else {
        toastText = "Reaction updated";
      }
    }

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;

        const existingLocal = m.reactions?.find((r) => r.userId === "me");

        let next;
        if (existingLocal) {
          if (existingLocal.emoji === emoji) {
            next = [];
          } else {
            next = [{ emoji, userId: "me" }];
          }
        } else {
          next = [{ emoji, userId: "me" }];
        }

        return { ...m, reactions: next };
      })
    );

    addToast(toastText, "info", DEFAULT_TOAST_MS);
  };

  const startLongPress = (messageId) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    longPressTriggeredRef.current = false;

    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setActiveReactionMessageId(messageId);
      reactionOpenedAtRef.current = Date.now();
    }, 350);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleClearChat = () => {
    const key = getStorageKey(user, isAuthenticated);
    if (key) localStorage.removeItem(key);
    setActiveReactionMessageId(null);
    setMessages([makeInitialMessage(user?.name)]);
    addToast("Chat cleared", "info", DEFAULT_TOAST_MS);
  };

  const modeLabel = isAuthenticated
    ? "Permanent friend (signed in)"
    : "Temporary friend (this session only)";

  return (
    <div
      className={`h-full flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent shadow-sm overflow-hidden chat-themable-container ${themeClass}`}
    >
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-900/40 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-slate-100">Friend Mode</h1>
          <p className="text-xs text-slate-300 truncate">{modeLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleThemeChange(t.id)}
              className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] border transition ${
                theme === t.id
                  ? "bg-white/80 text-slate-900 border-blue-500"
                  : "bg-white/20 text-slate-100 border-transparent hover:border-blue-300"
              }`}
            >
              {t.label}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClearChat}
            className="px-2 py-0.5 rounded-full text-[9px] border border-red-400 text-red-300 hover:bg-red-500/20"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 pb-8 space-y-4 text-sm chat-messages-area"
      >
        {messages.map((m) => {
          const isUser = m.role === "user";
          const isAi = m.role === "assistant";
          const name = isUser ? user?.name || "You" : "LC_Ai 🤖";

          const timeLabel = m.createdAt
            ? new Date(m.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";

          const bubbleClass = isUser
            ? bubbleStyles.me
            : isAi
            ? bubbleStyles.ai
            : bubbleStyles.other;

          const myReaction = m.reactions?.find((r) => r.userId === "me");

          return (
            <div
              key={m.id}
              className={`flex w-full ${
                isUser ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`flex flex-col max-w-[85%] sm:max-w-[80%] ${
                  isUser ? "items-end" : "items-start"
                }`}
              >
                <span className="text-[10px] text-white/90 mb-1">{name}</span>

                <div
                  className={`px-3 sm:px-4 py-2 text-xs sm:text-sm shadow-sm rounded-2xl cursor-pointer select-none break-words ${bubbleClass} ${
                    isUser ? "rounded-br-sm" : "rounded-bl-sm"
                  }`}
                  onMouseDown={() => startLongPress(m.id)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onTouchStart={() => startLongPress(m.id)}
                  onTouchEnd={cancelLongPress}
                >
                  <span
                    className={
                      theme === "love"
                        ? "glow-text-love"
                        : theme === "sunset"
                        ? "glow-text-sunset"
                        : ""
                    }
                  >
                    {m.text}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-1 mx-1">
                  {timeLabel && (
                    <span className="text-[9px] text-slate-100">
                      {timeLabel}
                    </span>
                  )}

                  {myReaction && (
                    <div className="flex gap-1 text-[10px] bg-black/25 px-1.5 py-0.5 rounded-full">
                      {myReaction.emoji}
                    </div>
                  )}
                </div>

                {activeReactionMessageId === m.id && (
                  <div
                    data-reaction-bar="true"
                    className="mt-1 flex flex-wrap gap-1 text-xs bg-black/25 px-2 py-1 rounded-full"
                  >
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleReactionClick(m.id, emoji)}
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

        {loading && (
          <div className="flex justify-start w-full mt-1">
            <div className="bg-black/25 text-white text-xs px-3 py-2 rounded-2xl rounded-tl-none border border-white/40 shadow-md">
              LC_Ai is thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="border-t border-gray-200/50 dark:border-gray-700 px-3 sm:px-4 py-2 flex flex-col gap-2 shrink-0 chat-input-area bg-black/40"
      >
        <div className="flex flex-wrap gap-1 text-lg sm:text-xl">
          {INPUT_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => handleEmojiClick(em)}
              className="px-1 rounded hover:bg-black/25"
            >
              {em}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300/40 dark:border-gray-700 bg-black/40 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/70 placeholder:text-gray-400"
            placeholder={
              user?.name
                ? `Tell me anything, ${user.name} 😊`
                : "Tell me anything…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
          >
            Send
          </button>
        </div>
      </form>

      {/* Toasts (top-right) */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-sm w-full px-4 py-2 rounded shadow-md text-sm
              ${t.type === "success" ? "bg-emerald-600 text-white" : ""}
              ${t.type === "error" ? "bg-red-600 text-white" : ""}
              ${t.type === "info" ? "bg-slate-700 text-white" : ""}
              ${t.type === "warning" ? "bg-amber-500 text-black" : ""}
            `}
            style={{ animation: "toastIn .18s ease-out" }}
          >
            {t.message}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes toastIn {
          from { transform: translateY(-6px) scale(0.98); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
