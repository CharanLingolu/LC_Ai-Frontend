// src/layout/MainLayout.jsx
import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();

  // ------------------ SCROLLBAR STYLE ------------------
  const scrollbarStyles =
    theme === "light"
      ? `
    /* LIGHT MODE SCROLLBAR */
    * { scrollbar-width: thin; scrollbar-color: #9ca3af #e5e7eb; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #e5e7eb; }
    ::-webkit-scrollbar-thumb { background: #9ca3af; border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: #6b7280; }
  `
      : `
    /* DARK MODE (default) SCROLLBAR */
    * { scrollbar-width: thin; scrollbar-color: #6b7280 #1f2937; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #1f2937; }
    ::-webkit-scrollbar-thumb { background: #6b7280; border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
  `;

  // ---------- Chat default theme overrides ----------
  const chatDefaultOverrides =
    theme === "light"
      ? `
    /* ================= LIGHT MODE FIXES ================= */
    
    /* 1. Base Container Setup */
    .chat-theme-default {
      --chat-bg: #ffffff;
      --chat-text: #0f172a;
      background: var(--chat-bg) !important;
      color: var(--chat-text) !important;
    }

    /* 2. GENERAL TEXT VISIBILITY: Force "light" utility classes to be Dark Gray
       This catches most headers and labels. */
    .chat-theme-default .text-slate-100,
    .chat-theme-default .text-slate-200,
    .chat-theme-default .text-slate-300,
    .chat-theme-default .text-gray-100,
    .chat-theme-default .text-gray-200,
    .chat-theme-default .text-white {
      color: #334155 !important; /* Dark Slate Gray */
    }

    /* 2b. SPECIFIC FIX FOR SENDER NAMES & LABELS
       We force the "sender-label" class and tiny text to be BLACK and BOLD. */
    .chat-theme-default .sender-label,
    .chat-theme-default .text-\\[10px\\],
    .chat-theme-default .text-xs {
      color: #000000 !important; /* Pure Black for visibility */
      font-weight: 600 !important;
      opacity: 1 !important;
    }

    /* 3. PROTECT CHAT BUBBLES (The Shield)
       Target the Blue and Purple bubbles specifically to keep their text WHITE. 
       This overrides Rule #2 and #2b inside the bubbles. */
    .chat-theme-default div[class*="bg-blue-600"],
    .chat-theme-default div[class*="bg-purple-500"] {
       color: #ffffff !important;
    }

    /* 4. FORCE WHITE TEXT INSIDE BUBBLES
       Even if 'text-white' or 'text-xs' is used inside a bubble, keep it white. */
    .chat-theme-default div[class*="bg-blue-600"] *,
    .chat-theme-default div[class*="bg-purple-500"] * {
       color: #ffffff !important;
    }
    
    /* 4b. Sub-fix for timestamps inside bubbles to be slightly transparent white */
    .chat-theme-default div[class*="bg-blue-600"] .text-\\[9px\\],
    .chat-theme-default div[class*="bg-purple-500"] .text-\\[9px\\] {
       color: rgba(255, 255, 255, 0.85) !important;
    }

    /* 5. Fix Input Area & Textareas */
    .chat-theme-default .chat-input-area,
    .chat-theme-default textarea {
      background-color: #ffffff !important;
      color: #0f172a !important;
      border-color: #e2e8f0 !important;
    }
    .chat-theme-default textarea::placeholder {
      color: #94a3b8 !important;
    }

    /* 6. Fix Header & Transparencies */
    .chat-theme-default .bg-gray-900\\/40,
    .chat-theme-default .bg-black\\/40,
    .chat-theme-default .bg-black\\/25 {
      background-color: #f8fafc !important;
      border-bottom: 1px solid #e2e8f0 !important;
    }

    /* 7. Fix Small Buttons (Theme Pills / Reaction Badges) */
    .chat-theme-default button.bg-white\\/20, 
    .chat-theme-default .bg-white\\/20 {
      background-color: #e2e8f0 !important;
      color: #0f172a !important;
      border: 1px solid #cbd5e1 !important;
    }

    /* 8. Fix Settings Dropdowns (Turn Dark Cards -> White Cards) */
    .chat-theme-default .bg-gray-800,
    .chat-theme-default .bg-slate-800,
    .chat-theme-default .bg-zinc-900,
    .chat-theme-default .bg-black {
      background-color: #ffffff !important;
      color: #0f172a !important;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06) !important;
      border: 1px solid #e2e8f0 !important;
    }

    /* 9. Fix Clear Button (Red Text) */
    .chat-theme-default .text-red-300, 
    .chat-theme-default .text-red-400 {
      color: #dc2626 !important;
    }
  `
      : `
    /* DARK MODE DEFAULTS */
    .chat-theme-default {
      --chat-bg: radial-gradient(circle at top, #0f172a 0%, #020617 60%, #020617 100%);
      --chat-text: #e5e7eb;
    }
  `;

  return (
    <div className="h-[100dvh] bg-gray-100 text-slate-900 dark:bg-gray-900 dark:text-slate-100 flex">
      {/* Inject scrollbar styling */}
      <style>{scrollbarStyles}</style>

      {/* Inject chat default theme overrides */}
      <style>{chatDefaultOverrides}</style>

      {/* -------- MOBILE OVERLAY -------- */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* -------- SIDEBAR -------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200
          bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-6 space-y-4 font-medium
          flex flex-col ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:static md:translate-x-0`}
      >
        <h2 className="text-2xl font-bold">LC_Ai</h2>

        {/* Navigation */}
        <nav className="space-y-3 flex-1">
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="block hover:text-blue-500"
          >
            Home
          </Link>
          <Link
            to="/prompt"
            onClick={() => setSidebarOpen(false)}
            className="block hover:text-blue-500"
          >
            Prompt Engineer
          </Link>
          <Link
            to="/text-tools"
            onClick={() => setSidebarOpen(false)}
            className="block hover:text-blue-500"
          >
            Text Tools
          </Link>
          <Link
            to="/friend"
            onClick={() => setSidebarOpen(false)}
            className="block hover:text-blue-500"
          >
            Friend Mode
          </Link>
          <Link
            to="/rooms"
            onClick={() => setSidebarOpen(false)}
            className="block hover:text-blue-500"
          >
            Rooms
          </Link>
        </nav>

        {/* Theme Button */}
        <button
          onClick={toggleTheme}
          className="w-full px-3 py-2 rounded-lg border text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </button>

        {/* User Section */}
        <div className="border-t border-gray-300 dark:border-gray-600 pt-4">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt="avatar"
                  className="w-10 h-10 rounded-full border border-gray-300 dark:border-gray-700"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold uppercase">
                  {user?.name?.[0] || "?"}
                </div>
              )}

              <div className="flex flex-col">
                <span className="text-sm font-semibold">{user.name}</span>
                <button
                  onClick={logout}
                  className="text-xs text-red-500 hover:underline"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : (
            <Link
              to="/login"
              onClick={() => setSidebarOpen(false)}
              className="block text-center px-4 py-2 rounded-lg border border-blue-500 text-blue-500 hover:bg-blue-600 hover:text-white text-sm transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </aside>

      {/* -------- MAIN CONTENT -------- */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 md:hidden">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <div className="w-5 h-0.5 bg-current mb-1" />
            <div className="w-5 h-0.5 bg-current mb-1" />
            <div className="w-5 h-0.5 bg-current" />
          </button>
          <span className="font-semibold text-lg">LC_Ai</span>
        </header>

        <main className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-hidden p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
