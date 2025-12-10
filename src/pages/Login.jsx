import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import GoogleSignInButton from "../components/GoogleSignInButton";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ---------------- Toast System ----------------
  const [toasts, setToasts] = useState([]);
  const DEFAULT_TOAST_LIFETIME = 1400; // default for non-success
  const SUCCESS_TOAST_LIFETIME = 2000; // longer for "signed in" messages

  const addToast = (
    message,
    type = "info",
    duration = DEFAULT_TOAST_LIFETIME
  ) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };

  const setErrorToast = (msg) => {
    setError(msg);
    addToast(msg, "error");
  };

  // Spinner component
  const Spinner = ({ size = 16 }) => (
    <svg
      className="animate-spin inline-block mr-2"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        opacity="0.25"
        fill="none"
      />
      <path
        d="M22 12a10 10 0 00-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.9"
        fill="none"
      />
    </svg>
  );

  // ---------------- Email/PW Login ----------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      return setErrorToast("Please enter both email and password.");
    }

    try {
      setLoading(true);

      const res = await fetch(
        "https://lc-ai-backend-a080.onrender.com/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      // Try to parse JSON safely, but fall back to text if not JSON
      const text = await res.text(); // read raw body first
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseErr) {
        // Not JSON (likely HTML error page or plain text)
        console.warn("Non-JSON response from /api/auth/login:", text);
      }

      if (!res.ok) {
        // Prefer a JSON error message if available, otherwise show the raw text (trimmed)
        const message =
          (data && (data.error || data.message)) ||
          (text ? text.substring(0, 100) : "Invalid response from server");
        setLoading(false);
        return setErrorToast(message);
      }

      // res.ok and parsed JSON expected in `data`
      if (!data) {
        setLoading(false);
        return setErrorToast("Server returned an unexpected response.");
      }

      addToast("Login successful", "success", SUCCESS_TOAST_LIFETIME);
      login(data.user, data.token);
      setTimeout(() => {
        setLoading(false);
        navigate("/rooms", { replace: true });
      }, SUCCESS_TOAST_LIFETIME);
    } catch (err) {
      console.error("Login error:", err);
      setLoading(false);
      setErrorToast("Something went wrong. Try again.");
    }
  };

  // ---------------- Google Login ----------------
  const handleGoogleSuccess = async (tokenResponse) => {
    try {
      setLoading(true);

      // Fetch Google Profile
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });

      const profile = await res.json();

      // Send to backend for login/signup
      const backendRes = await fetch(
        "https://lc-ai-backend-a080.onrender.com/api/auth/google",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        }
      );

      const data = await backendRes.json();

      if (!backendRes.ok) {
        setLoading(false);
        return setErrorToast(data.error || "Google login failed");
      }

      addToast("Google login successful", "success", SUCCESS_TOAST_LIFETIME);
      login(data.user, data.token);

      setTimeout(() => {
        setLoading(false);
        navigate("/rooms", { replace: true });
      }, SUCCESS_TOAST_LIFETIME);
    } catch (err) {
      setLoading(false);
      console.error("Google login error:", err);
      setErrorToast("Google login failed.");
    }
  };

  return (
    <>
      <div className="max-w-md mx-auto mt-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-md">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-5">
          Login to LC_Ai
        </h1>

        {error && (
          <p className="text-red-500 text-sm mb-3 text-center">{error}</p>
        )}

        {/* Email/password login */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-4">
          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              className="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="******"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 flex justify-center items-center"
          >
            {loading && <Spinner />}
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-2 my-4">
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
          <span className="text-xs text-slate-500 dark:text-slate-400">or</span>
          <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
        </div>

        {/* Google login */}
        <GoogleSignInButton onSuccess={handleGoogleSuccess} />

        <p className="text-xs text-center mt-4 text-slate-500 dark:text-slate-400">
          Don't have an account?{" "}
          <Link to="/signup" className="text-blue-500 hover:underline">
            Sign up
          </Link>
        </p>
      </div>

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-sm w-full px-4 py-2 rounded shadow text-sm
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

      {/* Toast animation */}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
