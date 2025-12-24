import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState(1); // 1 = details, 2 = otp
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devOtp, setDevOtp] = useState(""); // optional: show OTP when mail fails

  // ------ Toast system (self-contained) ------
  const [toasts, setToasts] = useState([]);
  const DEFAULT_TOAST_LIFETIME = 1400;
  const SUCCESS_TOAST_LIFETIME = 2000; // longer for success

  const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  const addToast = (
    message,
    type = "info",
    duration = DEFAULT_TOAST_LIFETIME
  ) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type };
    setToasts((t) => [...t, toast]);

    // auto remove
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, duration);
  };

  // helper to set error and show toast
  const setErrorWithToast = (msg) => {
    setError(msg);
    if (msg) addToast(msg, "error");
  };

  // ------ Handlers ------
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !password.trim()) {
      return setErrorWithToast("Please fill all fields.");
    }

    try {
      setLoading(true);

      console.log("📤 Sending OTP request:", { name, email });

      const res = await fetch(`${BACKEND}/api/auth/signup/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ IMPORTANT
        body: JSON.stringify({ name, email, password }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Server returned invalid response");
      }

      setLoading(false);

      if (!res.ok) {
        return setErrorWithToast(data.error || "Failed to send OTP");
      }

      // ✅ SUCCESS FEEDBACK
      addToast("OTP sent to your email", "success", SUCCESS_TOAST_LIFETIME);

      // // optional dev OTP display
      // if (data.devOtp) {
      //   setDevOtp(data.devOtp);
      //   addToast(`Dev OTP: ${data.devOtp}`, "warning");
      // }

      setStep(2);
    } catch (err) {
      console.error("❌ OTP request failed:", err);
      setLoading(false);
      setErrorWithToast("Unable to send OTP. Please try again.");
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");

    if (!otp.trim()) {
      return setErrorWithToast("Please enter OTP");
    }

    try {
      setLoading(true);
      const res = await fetch(`${BACKEND}/api/auth/signup/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoading(false);
        return setErrorWithToast(data.error || "Invalid or expired OTP");
      }

      // success: log user in and show longer toast before navigating
      addToast(
        "Signup successful — logging you in",
        "success",
        SUCCESS_TOAST_LIFETIME
      );
      login(data.user, data.token);

      setTimeout(() => {
        setLoading(false);
        navigate("/rooms");
      }, SUCCESS_TOAST_LIFETIME);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setErrorWithToast("Something went wrong. Try again.");
    }
  };

  // small spinner used inside buttons
  const Spinner = ({ size = 16 }) => (
    <svg
      className="animate-spin inline-block align-middle mr-2"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 00-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );

  return (
    <>
      <div className="max-w-md mx-auto mt-24 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-md">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Create your LC_Ai account
        </h1>

        {error && (
          <p className="text-sm text-red-500 mb-3 text-center">{error}</p>
        )}

        {step === 1 && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                Name
              </label>
              <input
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>

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
                autoComplete="new-password"
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="******"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 flex items-center justify-center"
            >
              {loading && <Spinner />}
              <span>{loading ? "Sending OTP..." : "Sign Up & Send OTP"}</span>
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-300 mb-2">
              We sent a 6-digit OTP to <b>{email}</b>. Enter it below to verify.
            </p>

            {devOtp && (
              <p className="text-xs text-amber-500">
                Dev mode OTP: <b>{devOtp}</b>
              </p>
            )}

            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
                OTP Code
              </label>
              <input
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-900 text-sm tracking-[0.3em] text-center"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                pattern="\d*"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400 flex items-center justify-center"
            >
              {loading && <Spinner />}
              <span>{loading ? "Verifying..." : "Verify & Continue"}</span>
            </button>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full mt-1 text-xs text-slate-500 hover:underline"
            >
              Change email or password
            </button>
          </form>
        )}

        <p className="text-xs text-center mt-4 text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-500 hover:underline">
            Login
          </Link>
        </p>
      </div>

      {/* Toast container (top-right) */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-sm w-full px-4 py-2 rounded shadow-md text-sm
            ${t.type === "success" ? "bg-emerald-600 text-white" : ""}
            ${t.type === "error" ? "bg-red-600 text-white" : ""}
            ${t.type === "warning" ? "bg-amber-500 text-black" : ""}
            ${t.type === "info" ? "bg-slate-700 text-white" : ""}`}
            style={{
              animation: "toastIn .18s ease-out",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* small inline styles for toast animation (keeps component self-contained) */}
      <style>{`
        @keyframes toastIn {
          from { transform: translateY(-6px) scale(0.98); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
