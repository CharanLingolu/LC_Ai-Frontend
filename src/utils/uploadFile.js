// src/utils/uploadFile.js
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export async function uploadFileToCloudinary(file) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${text}`);
  }

  return res.json(); // { url, public_id, ... }
}
