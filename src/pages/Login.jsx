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
  const DEFAULT_TOAST_LIFETIME = 1400;
  const SUCCESS_TOAST_LIFETIME = 2000;

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

  // ---------------- Password Reset State ----------------
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStep, setResetStep] = useState(1);
  const [resetToken, setResetToken] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // ---------------- Email/PW Login ----------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      return setErrorToast("Please enter both email and password.");
    }

    try {
      setLoading(true);

      const res = await fetch(`${BACKEND}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseErr) {
        console.warn("Non-JSON response from /api/auth/login:", text);
      }

      if (!res.ok) {
        const message =
          (data && (data.error || data.message)) ||
          (text ? text.substring(0, 100) : "Invalid response from server");
        setLoading(false);
        return setErrorToast(message);
      }

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

      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });

      const profile = await res.json();

      const backendRes = await fetch(`${BACKEND}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

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

  const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  async function doFetchWithTimeout(url, opts = {}, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    opts.signal = controller.signal;

    try {
      const res = await fetch(url, opts);
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        data = { _rawText: text };
      }
      return { res, data, text };
    } catch (err) {
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------- Password Reset Handlers ----------------
  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError("");
    const targetEmail = (resetEmail || email).trim();
    if (!targetEmail) return setErrorToast("Please enter your email to reset.");

    setResetLoading(true);
    try {
      const url = `${BACKEND}/api/auth/password-reset/request`;
      const { res, data, text } = await doFetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: targetEmail }),
        },
        12000
      );

      if (!res.ok) {
        const message =
          (data && (data.error || data.message)) ||
          (text ? text.substring(0, 200) : "Failed to request password reset");
        return setErrorToast(message);
      }

      setResetEmail(targetEmail);
      setResetStep(2);

      if (data?.devResetToken) {
        addToast("Token (dev): " + data.devResetToken, "warning", 4000);
        setResetToken(data.devResetToken);
      } else {
        addToast(
          data?.message || "Reset email sent",
          "success",
          SUCCESS_TOAST_LIFETIME
        );
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setErrorToast("Request timed out");
      } else {
        setErrorToast("Failed to request reset");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmReset = async (e) => {
    e.preventDefault();
    setError("");

    if (!resetEmail.trim() || !resetToken.trim() || !resetNewPassword.trim()) {
      return setErrorToast("Please fill all fields.");
    }

    setResetLoading(true);
    try {
      const url = `${BACKEND}/api/auth/password-reset/confirm`;
      const { res, data, text } = await doFetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: resetEmail,
            token: resetToken,
            newPassword: resetNewPassword,
          }),
        },
        12000
      );

      if (!res.ok) {
        const message =
          (data && (data.error || data.message)) ||
          (text ? text.substring(0, 200) : "Failed to reset password");
        return setErrorToast(message);
      }

      if (data?.token && data?.user) {
        addToast(
          "Password reset successful — signed in",
          "success",
          SUCCESS_TOAST_LIFETIME
        );
        login(data.user, data.token);
        setTimeout(() => {
          setResetLoading(false);
          navigate("/rooms", { replace: true });
        }, SUCCESS_TOAST_LIFETIME);
        return;
      }

      addToast(
        data?.message || "Password reset successful",
        "success",
        SUCCESS_TOAST_LIFETIME
      );
      setResetOpen(false);
      setResetStep(1);
      setResetToken("");
      setResetNewPassword("");
    } catch (err) {
      if (err.name === "AbortError") {
        setErrorToast("Request timed out");
      } else {
        setErrorToast("Failed to reset password");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const toggleReset = () => {
    setResetOpen((v) => {
      const next = !v;
      if (!next) {
        setResetStep(1);
        setResetEmail("");
        setResetToken("");
        setResetNewPassword("");
      } else {
        setResetEmail(email || "");
      }
      return next;
    });
  };

  return (
    <>
      {/* h-[100dvh] = full viewport height
        flex items-center = centers vertically
        overflow-hidden = strictly no page scrolling
      */}
      <div className="h-[100dvh] w-full flex items-center justify-center bg-transparent overflow-hidden px-3">
        {/* Card Container:
          Removed: max-h, overflow-y-auto (No internal scrolling)
          Added: w-full max-w-sm (Width constraint)
          mb-10: Nudges it slightly up from dead-center
        */}
        <div className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md flex flex-col mb-10">
          {/* Reduced padding to p-3 to save space */}
          <div className="p-3">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2 text-center">
              Login to LC_Ai
            </h1>

            {error && (
              <p className="text-red-500 text-xs mb-2 text-center font-medium">
                {error}
              </p>
            )}

            {/* Tighter Form Spacing (space-y-2 instead of 3) */}
            <form onSubmit={handleSubmit} className="space-y-2 mb-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-0.5">
                  Email
                </label>
                {/* Reduced vertical padding (py-2) */}
                <input
                  type="email"
                  autoComplete="email"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-0.5">
                  Password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="******"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 flex justify-center items-center transition-colors"
              >
                {loading && <Spinner size={14} />}
                {loading ? "Logging in..." : "Login"}
              </button>

              <div className="flex items-center justify-between mt-1">
                <button
                  type="button"
                  onClick={toggleReset}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline"
                >
                  Forgot password?
                </button>
                <Link
                  to="/signup"
                  className="text-xs text-blue-500 hover:text-blue-600 hover:underline"
                >
                  Sign up
                </Link>
              </div>
            </form>

            {/* Compact Divider */}
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-[10px] text-slate-400 font-medium">OR</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>

            <div className="mb-2">
              <GoogleSignInButton onSuccess={handleGoogleSuccess} />
            </div>

            {/* Compact Reset Panel */}
            {resetOpen && (
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2">
                  {resetStep === 1 ? (
                    <form onSubmit={handleRequestReset} className="space-y-2">
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Enter email for reset token.
                      </p>

                      <input
                        type="email"
                        autoComplete="email"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="you@example.com"
                      />

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={resetLoading}
                          className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-300 flex items-center justify-center"
                        >
                          {resetLoading ? "..." : "Send OTP"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setResetStep(2)}
                          className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent text-slate-700 dark:text-slate-300"
                        >
                          Have OTP
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleConfirmReset} className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          autoComplete="one-time-code"
                          className="w-1/3 px-2 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                          value={resetToken}
                          onChange={(e) => setResetToken(e.target.value)}
                          placeholder="OTP"
                        />
                        <input
                          type="password"
                          autoComplete="new-password"
                          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          placeholder="New Password"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={resetLoading}
                          className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300 flex items-center justify-center"
                        >
                          {resetLoading ? "..." : "Reset PW"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setResetStep(1)}
                          className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent text-slate-700 dark:text-slate-300"
                        >
                          Back
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-xs w-full px-4 py-2 rounded shadow-lg text-sm font-medium pointer-events-auto
              ${t.type === "success" ? "bg-emerald-600 text-white" : ""}
              ${t.type === "error" ? "bg-red-600 text-white" : ""}
              ${t.type === "info" ? "bg-slate-800 text-white" : ""}
              ${t.type === "warning" ? "bg-amber-500 text-black" : ""}
            `}
            style={{ animation: "toastIn .2s ease-out" }}
          >
            {t.message}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
