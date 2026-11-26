/** Home look modes. Purely visual; saved in localStorage. Default "ghost" = original look. */
import { useEffect, useState } from "react";

/**
 * Seasonal Thanksgiving look. Flip this to false after the holiday to drop the
 * festive default, hide the picker option, and fall back to Ghost. A visitor can
 * also switch to another Look at any time; that choice is still saved.
 */
export const THANKSGIVING_THEME_ON = true;

export type ThemeId = "ghost" | "thanksgiving" | "autumn" | "winter" | "spring" | "summer";

/** Visual look plus an optional seasonal greeting. Add or change a greeting here when the season changes. */
export type ThemeDef = {
  id: ThemeId;
  label: string;
  icon: string;
  greeting?: string;
};

const CORE_THEMES: ThemeDef[] = [
  { id: "ghost", label: "Ghost", icon: "👻" },
  { id: "autumn", label: "Autumn", icon: "🍂" },
  { id: "winter", label: "Winter", icon: "❄️" },
  { id: "spring", label: "Spring", icon: "🌸" },
  { id: "summer", label: "Summer", icon: "☀️" },
];

const THANKSGIVING_THEME: ThemeDef = {
  id: "thanksgiving",
  label: "Thanksgiving",
  icon: "🦃",
  greeting: "Happy Thanksgiving",
};

export const THEMES: ThemeDef[] = THANKSGIVING_THEME_ON
  ? [CORE_THEMES[0], THANKSGIVING_THEME, ...CORE_THEMES.slice(1)]
  : CORE_THEMES;

export function themeDef(id: ThemeId): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id);
}

/** Seasonal greeting for the active look, or null when that look has none. */
export function themeGreeting(id: ThemeId): string | null {
  return themeDef(id)?.greeting ?? null;
}

export const THEME_KEY = "youcog:theme";
const EVT = "youcog:theme";
export const DEFAULT_THEME: ThemeId = THANKSGIVING_THEME_ON ? "thanksgiving" : "ghost";

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export function readTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function setTheme(t: ThemeId) {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVT));
}

/** Keep a theme-* class and data-theme on <html> so CSS can key off the look. */
export function applyThemeClass(theme: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const id of ["ghost", "thanksgiving", "autumn", "winter", "spring", "summer"]) {
    root.classList.toggle(`theme-${id}`, id === theme);
  }
  root.dataset.theme = theme;
}

export function useTheme(): ThemeId {
  const [t, set] = useState<ThemeId>(DEFAULT_THEME);
  useEffect(() => {
    const f = () => {
      const next = readTheme();
      set(next);
      applyThemeClass(next);
    };
    f();
    window.addEventListener(EVT, f);
    window.addEventListener("storage", f);
    return () => {
      window.removeEventListener(EVT, f);
      window.removeEventListener("storage", f);
    };
  }, []);
  return t;
}
