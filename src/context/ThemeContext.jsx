import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // 🔥 Default = "dark", but if we already saved a theme, use that
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("lc_ai_theme");
    if (saved === "dark" || saved === "light") {
      return saved;
    }
    return "dark"; // default
  });

  // Apply theme to <html> + save
  useEffect(() => {
    const root = document.documentElement;

    // Tailwind dark-mode via class strategy
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    localStorage.setItem("lc_ai_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
