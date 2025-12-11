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

  // ---------------- Password Reset State ----------------
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStep, setResetStep] = useState(1); // 1 = request, 2 = confirm
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

  // use your Vite env or fallback to localhost
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

  // ---------------- Password Reset Handlers (REPLACED) ----------------

  // Step 1: request reset (sends email with token/link)
  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError("");
    const targetEmail = (resetEmail || email).trim();
    if (!targetEmail) return setErrorToast("Please enter your email to reset.");

    setResetLoading(true);
    try {
      const url = `${BACKEND}/api/auth/password-reset/request`;
      console.log("➡️ [REQUEST RESET] url:", url, "email:", targetEmail);

      const { res, data, text } = await doFetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: targetEmail }),
        },
        12000 // 12s timeout
      );

      console.log(
        "⬅️ [REQUEST RESET] status:",
        res.status,
        "body:",
        data || text
      );

      if (!res.ok) {
        const message =
          (data && (data.error || data.message)) ||
          (text ? text.substring(0, 200) : "Failed to request password reset");
        return setErrorToast(message);
      }

      // success: move to confirm step
      setResetEmail(targetEmail);
      setResetStep(2);

      // If server returned a dev token (email failed), show it and auto-fill token for convenience
      if (data?.devResetToken) {
        addToast(
          "Email delivery failed — using dev token (visible in console)",
          "warning",
          4000
        );
        console.log("DEV RESET TOKEN:", data.devResetToken);
        setResetToken(data.devResetToken);
        // keep resetStep as 2 so user can paste or auto-use token
      } else {
        addToast(
          data?.message || "Reset email sent — check your inbox",
          "success",
          SUCCESS_TOAST_LIFETIME
        );
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.error("Request reset aborted (timeout).");
        setErrorToast("Request timed out — try again.");
      } else {
        console.error("Request reset error:", err);
        setErrorToast("Failed to request password reset. Try again.");
      }
    } finally {
      setResetLoading(false); // ALWAYS clear spinner
    }
  };

  // Step 2: confirm reset (token + new password)
  const handleConfirmReset = async (e) => {
    e.preventDefault();
    setError("");

    if (!resetEmail.trim() || !resetToken.trim() || !resetNewPassword.trim()) {
      return setErrorToast("Please fill email, token and new password.");
    }

    setResetLoading(true);
    try {
      const url = `${BACKEND}/api/auth/password-reset/confirm`;
      console.log("➡️ [CONFIRM RESET] url:", url, "email:", resetEmail);

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

      console.log(
        "⬅️ [CONFIRM RESET] status:",
        res.status,
        "body:",
        data || text
      );

      if (!res.ok) {
        const message =
          (data && (data.error || data.message)) ||
          (text ? text.substring(0, 200) : "Failed to reset password");
        return setErrorToast(message);
      }

      // success: optionally auto-login if backend returned token
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
      // close reset UI
      setResetOpen(false);
      setResetStep(1);
      setResetToken("");
      setResetNewPassword("");
    } catch (err) {
      if (err.name === "AbortError") {
        console.error("Confirm reset aborted (timeout).");
        setErrorToast("Request timed out — try again.");
      } else {
        console.error("Confirm reset error:", err);
        setErrorToast("Failed to reset password. Try again.");
      }
    } finally {
      setResetLoading(false); // ALWAYS clear spinner
    }
  };

  const toggleReset = () => {
    setResetOpen((v) => {
      const next = !v;
      if (!next) {
        // closing: reset fields
        setResetStep(1);
        setResetEmail("");
        setResetToken("");
        setResetNewPassword("");
      } else {
        // opening: prefill resetEmail from login email
        setResetEmail(email || "");
      }
      return next;
    });
  };

  return (
    <>
      {/* Outer centered viewport container — prevents page-level clipping */}
      <div className="min-h-screen w-full flex items-center justify-center px-2 py-4 bg-transparent">
        {/* Card wrapper */}
        <div
          className="login-card-wrapper w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 sm:p-5 shadow-md"
          style={{ maxHeight: "96vh" }}
        >
          <h1 className="title text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3 sm:mb-5">
            Login to LC_Ai
          </h1>

          {error && (
            <p className="text-red-500 text-sm mb-2 text-center">{error}</p>
          )}

          {/* Email/password login */}
          <form onSubmit={handleSubmit} className="space-y-3 mb-3">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                className="w-full px-3 py-2 text-sm rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-900"
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
                className="w-full px-3 py-2 text-sm rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-900"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="******"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 flex justify-center items-center"
            >
              {loading && <Spinner size={14} />}
              {loading ? "Logging in..." : "Login"}
            </button>

            <div className="flex items-center justify-between mt-1">
              <button
                type="button"
                onClick={toggleReset}
                className="text-xs text-slate-500 hover:underline"
              >
                Forgot password?
              </button>
              <Link
                to="/signup"
                className="text-xs text-blue-500 hover:underline"
              >
                Sign up
              </Link>
            </div>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-2 my-3">
            <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              or
            </span>
            <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" />
          </div>

          {/* Google login */}
          <div className="mb-3">
            <GoogleSignInButton onSuccess={handleGoogleSuccess} />
          </div>

          {/* Password Reset Panel */}
          {!resetOpen ? null : (
            <div className="mt-2 w-full">
              <div className="w-full max-w-full bg-white/80 dark:bg-gray-900 border rounded p-3 sm:p-4">
                {resetStep === 1 ? (
                  <form onSubmit={handleRequestReset} className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                      Enter your email to receive a password reset token.
                    </p>

                    <input
                      type="email"
                      autoComplete="email"
                      className="w-full px-3 py-2 text-sm rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="you@example.com"
                    />

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="submit"
                        disabled={resetLoading}
                        className="flex-1 px-3 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-300 flex items-center justify-center"
                      >
                        {resetLoading && <Spinner size={14} />}
                        {resetLoading ? "Sending..." : "Send reset otp"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setResetStep(2)}
                        className="px-3 py-2 text-sm rounded-lg border w-full sm:w-auto"
                      >
                        I have otp
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleConfirmReset} className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                      Enter the otp you received and a new password.
                    </p>

                    <input
                      type="email"
                      autoComplete="email"
                      className="w-full px-3 py-2 text-sm rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="you@example.com"
                    />

                    <input
                      type="text"
                      autoComplete="one-time-code"
                      className="w-full px-3 py-2 text-sm rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Reset Otp"
                    />

                    <input
                      type="password"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 text-sm rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="New password"
                    />

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="submit"
                        disabled={resetLoading}
                        className="flex-1 px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300 flex items-center justify-center"
                      >
                        {resetLoading && <Spinner size={14} />}
                        {resetLoading ? "Setting..." : "Set new password"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setResetStep(1)}
                        className="px-3 py-2 text-sm rounded-lg border w-full sm:w-auto"
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

      {/* responsive shrink + small-height scaling to guarantee fit on tiny viewports */}
      <style>{`
        @media (max-width: 420px) {
          .login-card-wrapper { padding: 10px !important; border-radius: 10px !important; }
          .login-card-wrapper .title { font-size: 15px !important; margin-bottom: 8px !important; }
          .login-card-wrapper input { padding-top: 8px !important; padding-bottom: 8px !important; }
          .login-card-wrapper button { padding-top: 8px !important; padding-bottom: 8px !important; font-size: 13px !important; }
          .login-card-wrapper .mb-3 { margin-bottom: 8px !important; }
          .login-card-wrapper .my-3 { margin-top: 8px !important; margin-bottom: 8px !important; }
        }

        @media (max-height: 700px) {
          .login-card-wrapper { transform: scale(0.96); transform-origin: top center; }
        }
        @media (max-height: 660px) {
          .login-card-wrapper { transform: scale(0.92); transform-origin: top center; }
        }
        @media (max-height: 620px) {
          .login-card-wrapper { transform: scale(0.88); transform-origin: top center; }
        }
        @media (max-height: 580px) {
          .login-card-wrapper { transform: scale(0.84); transform-origin: top center; }
        }

        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
