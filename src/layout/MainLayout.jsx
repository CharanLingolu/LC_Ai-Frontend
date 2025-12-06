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
    * {
      scrollbar-width: thin;
      scrollbar-color: #9ca3af #e5e7eb;
    }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #e5e7eb; }
    ::-webkit-scrollbar-thumb {
      background: #9ca3af;
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover { background: #6b7280; }
  `
      : `
    /* DARK MODE (default) SCROLLBAR */
    * {
      scrollbar-width: thin;
      scrollbar-color: #6b7280 #1f2937;
    }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #1f2937; }
    ::-webkit-scrollbar-thumb {
      background: #6b7280;
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
  `;

  return (
    <div className="h-[100dvh] bg-gray-100 text-slate-900 dark:bg-gray-900 dark:text-slate-100 flex">
      {/* Inject scrollbar styling */}
      <style>{scrollbarStyles}</style>

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
        {/* Mobile header */}
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

        {/* Height-constrained content area */}
        <main className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-hidden p-4 md:p-6">
            {/* Pages like FriendMode / ChatWindow must use h-full inside */}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
