// src/utils/aiClient.js

// Backend base URL
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/**
 * Call LC_Ai backend
 * @param {string} mode - "friend" | "prompt_engineer" | "text_tools" | "room" | ...
 * @param {Array<{role: string, content: string}>} messages
 * @param {string|null} token - optional JWT
 */
export async function callLCai(mode, messages, token) {
  const res = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ mode, messages }),
  });

  let data;
  try {
    data = await res.json();
  } catch (e) {
    // If backend returns HTML (like a 500 HTML page), avoid "Unexpected token <"
    throw new Error("AI request failed: invalid JSON response");
  }

  if (!res.ok) {
    throw new Error(data.error || "AI request failed");
  }

  return data.reply; // { role, content }
}
