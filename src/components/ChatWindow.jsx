import { useState, useRef, useEffect, useMemo } from "react";

const INPUT_EMOJIS = ["😀", "😂", "😍", "😢", "🔥", "👍", "🙏"];
const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "🔥", "😢"];

const ROOM_THEMES = [
  { id: "default", label: "Default" },
  { id: "love", label: "Love" },
  { id: "midnight", label: "Midnight" },
  { id: "sunset", label: "Sunset" },
];

export default function ChatWindow({
  title = "Friend Mode (Temporary)",
  mode = "friend-temp",
}) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "ai",
      text: "Hey 👋 I'm LC_Ai. How are you feeling today?",
      createdAt: new Date().toISOString(),
      reactions: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [currentTheme, setCurrentTheme] = useState("default");
  const [activeReactionMessageId, setActiveReactionMessageId] = useState(null);
  const longPressTimerRef = useRef(null);

  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  // keep keyboard open until user explicitly closes it (mobile)
  const [keepKeyboardOpen, setKeepKeyboardOpen] = useState(true);

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

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isSending]);

  const addMessage = (msg) => {
    setMessages((prev) => [...prev, msg]);
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const now = new Date().toISOString();

    const userMessage = {
      id: Date.now(),
      role: "user",
      text: trimmed,
      createdAt: now,
      reactions: [],
    };

    addMessage(userMessage);
    setInput("");
    setIsSending(true);

    // Re-focus the textarea to keep the mobile keyboard open.
    // Small timeout makes it more reliable across mobile browsers.
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    // Simulate AI reply (your existing behavior)
    setTimeout(() => {
      const fakeReplyText =
        mode === "prompt"
          ? "Let me improve this prompt for you… (this will be replaced with real AI soon!)."
          : mode === "text-tools"
          ? "Here’s how I’d rewrite or work with that text…"
          : "That sounds interesting! Tell me more 😊";

      const aiMessage = {
        id: Date.now() + 1,
        role: "ai",
        text: fakeReplyText,
        createdAt: new Date().toISOString(),
        reactions: [],
      };

      addMessage(aiMessage);
      setIsSending(false);

      // Keep focus after AI reply as well
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    }, 700);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiClick = (emoji) => {
    setInput((prev) => prev + emoji);
    // keep keyboard open when emoji inserted
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const handleThemeChange = (themeId) => {
    setCurrentTheme(themeId);
    // keep keyboard open when interacting with theme pills
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  // local reactions: we pretend userId is always "me"
  const handleReactionClick = (messageId, emoji) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const existingIndex = (m.reactions || []).findIndex(
          (r) => r.emoji === emoji && r.userId === "me"
        );
        let nextReactions;
        if (existingIndex >= 0) {
          nextReactions = [...m.reactions];
          nextReactions.splice(existingIndex, 1);
        } else {
          nextReactions = [...(m.reactions || []), { emoji, userId: "me" }];
        }
        return { ...m, reactions: nextReactions };
      })
    );
    // after picking a reaction, keep keyboard focused
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const startLongPress = (messageId) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      setActiveReactionMessageId(messageId);
    }, 350);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <div
      className={`h-full flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden chat-themable-container ${themeClass}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200/70 dark:border-gray-700 bg-gray-900/40 dark:bg-gray-900/70 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {/* MOBILE: Back / Close keyboard button (uses keepKeyboardOpen flag) */}
          <button
            type="button"
            onClick={() => {
              // user intentionally wants to close keyboard
              setKeepKeyboardOpen(false);
              inputRef.current?.blur();
              setActiveReactionMessageId(null);
            }}
            className="md:hidden px-2 py-1 rounded text-sm text-slate-100 hover:bg-white/5"
            aria-label="Close keyboard"
            title="Close keyboard"
          >
            ←
          </button>

          <div>
            <h1 className="text-sm font-semibold text-slate-100">{title}</h1>
            <p className="text-xs text-slate-300">
              Type a message and press Enter to send.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ROOM_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleThemeChange(t.id)}
              className={`px-2 py-0.5 rounded-full text-[10px] border transition
                ${
                  currentTheme === t.id
                    ? "bg-white/80 text-slate-900 border-blue-500"
                    : "bg-white/20 text-slate-100 border-transparent hover:border-blue-300"
                }`}
            >
              {t.label}
            </button>
          ))}
          {isSending && (
            <span className="text-xs text-slate-200">LC_Ai is thinking…</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 chat-messages-area"
      >
        {messages.map((m, index) => {
          const isUser = m.role === "user";
          const isAi = m.role === "ai";
          const timeLabel = m.createdAt
            ? new Date(m.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";

          const reactionCounts = (m.reactions || []).reduce((acc, r) => {
            acc[r.emoji] = (acc[r.emoji] || 0) + 1;
            return acc;
          }, {});

          return (
            <div
              key={m.id || index}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex flex-col max-w-[80%] ${
                  isUser ? "items-end" : "items-start"
                }`}
              >
                {!isUser && (
                  <div className="text-[10px] text-slate-100 mb-1 sender-label">
                    {isAi ? "LC_Ai" : "Friend"}
                  </div>
                )}
                <div
                  className={`px-4 py-2 text-sm shadow-sm break-words rounded-2xl cursor-pointer select-none ${
                    isUser
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : isAi
                      ? "bg-purple-500/85 text-purple-50 border border-purple-300/80 rounded-bl-sm"
                      : "bg-gray-200 text-slate-900 dark:bg-gray-800 dark:text-slate-100 rounded-bl-sm"
                  }`}
                  onMouseDown={() => startLongPress(m.id)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onTouchStart={() => startLongPress(m.id)}
                  onTouchEnd={cancelLongPress}
                >
                  {m.text}
                </div>
                <div className="flex items-center gap-2 mt-1 mx-1">
                  {timeLabel && (
                    <span className="text-[9px] text-gray-100/80 message-time">
                      {timeLabel}
                    </span>
                  )}
                  {Object.keys(reactionCounts).length > 0 && (
                    <div className="flex gap-1 text-[10px] bg-black/15 px-1.5 py-0.5 rounded-full">
                      {Object.entries(reactionCounts).map(([emoji, count]) => (
                        <span key={emoji} className="flex items-center">
                          <span className="mr-0.5">{emoji}</span>
                          <span className="text-[9px] text-gray-200">
                            {count}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {activeReactionMessageId === m.id && (
                  <div className="mt-1 flex gap-1 text-xs bg-black/80 px-2 py-1 rounded-full z-10">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          handleReactionClick(m.id, emoji);
                          setActiveReactionMessageId(null);
                        }}
                        className="px-1 rounded hover:bg-white/20"
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

        {isSending && (
          <div className="flex justify-start w-full mt-1">
            <div className="bg-black/25 text-white text-xs px-3 py-2 rounded-2xl rounded-tl-none border border-white/40 shadow-md">
              LC_Ai is thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200/50 dark:border-gray-700 p-3 shrink-0 chat-input-area bg-black/40">
        {/* Emoji row */}
        <div className="flex gap-1 mb-2 text-xl INPUT_EMOJIS">
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

        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            className="flex-1 resize-none rounded-lg border border-gray-300/40 dark:border-gray-600 bg-black/40 text-sm text-slate-100 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500 placeholder:text-gray-400"
            rows={1}
            placeholder="Talk to LC_Ai..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // If we should keep keyboard open, immediately refocus the input.
              // Small timeout makes this reliable across mobile browsers.
              if (keepKeyboardOpen) {
                setTimeout(() => {
                  inputRef.current?.focus();
                }, 60);
              }
            }}
          />

          <button
            onClick={handleSend}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()} // prevents temporary blur on pointer down
            onTouchStart={(e) => e.preventDefault()} // prevents temporary blur on touch
            disabled={isSending || !input.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:bg-blue-400 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
