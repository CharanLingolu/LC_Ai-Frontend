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

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !password.trim()) {
      return setError("Please fill all fields.");
    }

    try {
      setLoading(true);
      const res = await fetch(
        "http://localhost:5000/api/auth/signup/request-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        }
      );

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        return setError(data.error || "Failed to send OTP");
      }

      // If devOtp is returned (email failed), show it
      if (data.devOtp) {
        setDevOtp(data.devOtp);
      }

      setStep(2);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setError("Something went wrong. Try again.");
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");

    if (!otp.trim()) {
      return setError("Please enter OTP");
    }

    try {
      setLoading(true);
      const res = await fetch(
        "http://localhost:5000/api/auth/signup/verify-otp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp }),
        }
      );

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        return setError(data.error || "Invalid or expired OTP");
      }

      // success: log user in
      login(data.user, data.token);
      navigate("/rooms");
    } catch (err) {
      console.error(err);
      setLoading(false);
      setError("Something went wrong. Try again.");
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-md">
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
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
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
              className="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="******"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
          >
            {loading ? "Sending OTP..." : "Sign Up & Send OTP"}
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
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400"
          >
            {loading ? "Verifying..." : "Verify & Continue"}
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
  );
}
