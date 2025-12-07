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

// 🔹 helper to build initial greeting message
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
  const messagesContainerRef = useRef(null);

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

  // 1️⃣ Load saved conversation (or greeting)
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
          const now = new Date().toISOString();
          const mapped = parsed.map((m, idx) =>
            m.text || m.createdAt
              ? m
              : {
                  id: `old-${idx}-${Date.now()}`,
                  role: m.role,
                  text: m.content,
                  createdAt: now,
                  reactions: [],
                }
          );
          setMessages(mapped);
          return;
        }
      } catch {
        // ignore
      }
    }

    setMessages([makeInitialMessage(user?.name)]);
  }, [user?.email, user?.name, isAuthenticated]);

  // 2️⃣ Save conversation only for signed-in users
  useEffect(() => {
    const key = getStorageKey(user, isAuthenticated);
    if (!key) return;
    if (!messages || messages.length === 0) return;
    localStorage.setItem(key, JSON.stringify(messages));
  }, [messages, user?.email, isAuthenticated]);

  // 3️⃣ Auto-scroll when messages / loading change
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, loading]);

  // 4️⃣ Auto-scroll when reaction picker opens
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeReactionMessageId]);

  function buildMessagesForAPI(conversation) {
    const core = conversation.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.text || m.content,
    }));

    if (user?.name) {
      core.unshift({
        role: "user",
        content: `For this whole conversation, remember that my name is ${user.name}. If I ask "what is my name?", answer "${user.name}".`,
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

    try {
      const reply = await callLCai(
        "friend",
        buildMessagesForAPI(newMessages),
        token
      );

      const replyMsg = {
        id: `a-${Date.now()}`,
        role: reply.role || "assistant",
        text: reply.content,
        createdAt: new Date().toISOString(),
        reactions: [],
      };

      setMessages((prev) => [...prev, replyMsg]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: "Oops, I had trouble thinking for a moment. Can you try again?",
          createdAt: new Date().toISOString(),
          reactions: [],
        },
      ]);
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
  };

  // ✅ Only one reaction per message (for this user)
  const handleReactionClick = (messageId, emoji) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;

        const reactions = m.reactions || [];
        const idx = reactions.findIndex((r) => r.userId === "me");

        let next;
        if (idx >= 0) {
          if (reactions[idx].emoji === emoji) {
            // same emoji → toggle OFF
            next = reactions.filter((_, i) => i !== idx);
          } else {
            // different → REPLACE
            next = [...reactions];
            next[idx] = { ...next[idx], emoji };
          }
        } else {
          // no reaction yet → add one
          next = [{ emoji, userId: "me" }];
        }

        return { ...m, reactions: next };
      })
    );
  };

  const startLongPress = (messageId) => {
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

  // 🧼 Clear chat: reset history + localStorage + fresh greeting
  const handleClearChat = () => {
    const key = getStorageKey(user, isAuthenticated);
    if (key) {
      localStorage.removeItem(key);
    }
    setActiveReactionMessageId(null);
    setMessages([makeInitialMessage(user?.name)]);
  };

  const modeLabel = isAuthenticated
    ? "Permanent friend (signed in)"
    : "Temporary friend (this session only)";

  return (
    <div
      className={`h-full flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent shadow-sm overflow-hidden chat-themable-container ${themeClass}`}
    >
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-900/40 dark:bg-gray-900/70 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-slate-100">Friend Mode</h1>
          <p className="text-xs text-slate-300 truncate">{modeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center justify-start sm:justify-end gap-1 sm:gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleThemeChange(t.id)}
              className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] border transition
                ${
                  theme === t.id
                    ? "bg-white/80 text-slate-900 border-blue-500"
                    : "bg-white/20 text-slate-100 border-transparent hover:border-blue-300"
                }`}
            >
              {t.label}
            </button>
          ))}

          {/* 🧼 Clear chat button */}
          <button
            type="button"
            onClick={handleClearChat}
            className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] border border-red-400 text-red-300 hover:bg-red-500/20 whitespace-nowrap"
            title="Clear conversation"
          >
            Clear
          </button>

          {user && (
            <span className="text-[10px] sm:text-xs text-slate-200 hidden sm:inline">
              Logged in as <b>{user.name}</b>
            </span>
          )}
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

          const myReaction = (m.reactions || []).find((r) => r.userId === "me");

          const bubbleClass = isUser
            ? bubbleStyles.me
            : isAi
            ? bubbleStyles.ai
            : bubbleStyles.other;

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
                  className={`px-3 sm:px-4 py-2 text-xs sm:text-sm shadow-sm break-words rounded-2xl cursor-pointer select-none ${bubbleClass} ${
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

                <div className="flex items-center flex-wrap gap-2 mt-1 mx-1">
                  {timeLabel && (
                    <span className="text-[9px] text-slate-100">
                      {timeLabel}
                    </span>
                  )}
                  {myReaction && (
                    <div className="flex gap-1 text-[10px] bg-black/25 px-1.5 py-0.5 rounded-full">
                      <span className="flex items-center">
                        <span>{myReaction.emoji}</span>
                      </span>
                    </div>
                  )}
                </div>

                {activeReactionMessageId === m.id && (
                  <div className="mt-1 flex flex-wrap gap-1 text-xs bg-black/25 px-2 py-1 rounded-full shadow-md backdrop-blur-sm">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          handleReactionClick(m.id, emoji);
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
                ? "Tell me anything, " + user.name + " 😊"
                : "Tell me anything…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
