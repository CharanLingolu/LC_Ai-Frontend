// src/utils/aiClient.js

// Backend base URL
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/**
 * Call LC_Ai backend
 *
 * @param {string} mode - "friend" | "prompt_engineer" | "text_tools" | "room" | ...
 * @param {Array<{role: string, content: string}>} messages
 * @param {string|object} [options] - either:
 *    - token string (old style), OR
 *    - { token?: string, roomId?: string, ...extraBody }
 */
export async function callLCai(mode, messages, options) {
  let token;
  let extraBody = {};

  // Backward compatibility:
  //   callLCai(mode, messages, "jwt-token-string")
  if (typeof options === "string") {
    token = options;
  } else if (options && typeof options === "object") {
    // New style:
    //   callLCai(mode, messages, { token, roomId, ... })
    token = options.token;
    // copy all fields except token into request body
    const { token: _ignoredToken, ...rest } = options;
    extraBody = rest;
  }

  const res = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      mode,
      messages,
      ...extraBody, // e.g. { roomId }
    }),
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
