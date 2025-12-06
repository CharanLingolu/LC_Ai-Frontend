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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      return setError("Please enter both email and password.");
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

      const data = await res.json();

      if (!res.ok) {
        setLoading(false);
        return setError(data.error || "Invalid credentials");
      }

      login(data.user, data.token);
      navigate("/rooms", { replace: true });
    } catch (err) {
      setLoading(false);
      setError("Something went wrong. Try again.");
      console.error(err);
    }
  };

  const handleGoogleSuccess = async (tokenResponse) => {
    try {
      // STEP 1: Fetch profile from Google
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });

      const profile = await res.json();

      // STEP 2: Send profile to backend to create or login user
      const backendRes = await fetch(
        "https://lc-ai-backend-a080.onrender.com/auth/google",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        }
      );

      const data = await backendRes.json();
      if (!backendRes.ok) return setError(data.error || "Google login failed");

      login(data.user, data.token);
      navigate("/rooms", { replace: true });
    } catch (err) {
      console.error("Google login error:", err);
      setError("Google login failed.");
    }
  };

  return (
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
  );
}
