const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export async function callLCai(mode, messages, token) {
  const res = await fetch(`${API_BASE_URL}/api/chat/${mode}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ mode, messages }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "AI request failed");
  }
  return data.reply;
}
