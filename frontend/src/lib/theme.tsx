"use client";
/**
 * Theme system — light (default warm-editorial) + opt-in dark, applied via a
 * data-theme attribute on <html>. The initial value is set before paint by an
 * inline script in the root layout (no flash); this provider keeps it in sync
 * and exposes a toggle. Persisted to localStorage.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
export const THEME_KEY = "lm.theme";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function currentAttr(): Theme {
  if (typeof document !== "undefined") {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") return t;
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Sync React state with whatever the no-flash script already applied.
  useEffect(() => { setThemeState(currentAttr()); }, []);

  const apply = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", t);
    try { window.localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  }, []);

  const toggle = useCallback(() => apply(currentAttr() === "dark" ? "light" : "dark"), [apply]);

  return <ThemeContext.Provider value={{ theme, toggle, setTheme: apply }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside <ThemeProvider>");
  return ctx;
}
