import { createContext, useContext, useEffect, useState } from "react";
import { socket, registerSocketUser } from "../socket"; // ✅ important

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // Load stored session (refresh)
  useEffect(() => {
    const storedUser = localStorage.getItem("lc_ai_user");
    const storedToken = localStorage.getItem("lc_ai_token");

    if (storedUser && storedToken) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setToken(storedToken);

      // ✅ Tell socket who we are after page reload
      registerSocketUser(parsedUser);
    } else {
      // No user stored → set socket as guest
      registerSocketUser(null);
    }
  }, []);

  const login = (userData, jwt) => {
    setUser(userData);
    setToken(jwt);

    localStorage.setItem("lc_ai_user", JSON.stringify(userData));
    localStorage.setItem("lc_ai_token", jwt);

    // ✅ tell socket new identity
    registerSocketUser(userData);
  };

  const logout = () => {
    setUser(null);
    setToken(null);

    localStorage.removeItem("lc_ai_user");
    localStorage.removeItem("lc_ai_token");

    // ❗ IMPORTANT: tell backend you're now anonymous
    registerSocketUser(null);

    // OPTIONAL: Clear joined rooms so socket isn't still inside them
    socket.emit("leave_all_rooms");
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
