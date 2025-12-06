// src/components/ChatMessage.jsx
export default function ChatMessage({ role, text, createdAt }) {
  const isUser = role === "user";
  const isAi = role === "ai";

  const timeLabel = createdAt
    ? new Date(createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className={`flex mb-3 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm
        ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-200 text-slate-900 dark:bg-gray-800 dark:text-slate-100 rounded-bl-sm"
        }`}
      >
        {!isUser && (
          <div className="text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400">
            {isAi ? "LC_Ai" : "Friend"}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {timeLabel && (
          <div className="mt-1 text-[10px] text-right opacity-70">
            {timeLabel}
          </div>
        )}
      </div>
    </div>
  );
}
