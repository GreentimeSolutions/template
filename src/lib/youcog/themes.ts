/** Home look modes. Purely visual; saved in localStorage. Default "ghost" = original look. */
import { useEffect, useState } from "react";
export type ThemeId = "ghost" | "autumn" | "winter" | "spring" | "summer";
export const THEMES: { id: ThemeId; label: string; icon: string }[] = [
  { id: "ghost", label: "Ghost", icon: "👻" }, { id: "autumn", label: "Autumn", icon: "🍂" },
  { id: "winter", label: "Winter", icon: "❄️" }, { id: "spring", label: "Spring", icon: "🌸" },
  { id: "summer", label: "Summer", icon: "☀️" },
];
export const THEME_KEY = "youcog:theme";
const EVT = "youcog:theme";
export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
export function readTheme(): ThemeId {
  try { const v = localStorage.getItem(THEME_KEY); return isTheme(v) ? v : "ghost"; } catch { return "ghost"; }
}
export function setTheme(t: ThemeId) {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVT));
}
export function useTheme(): ThemeId {
  const [t, set] = useState<ThemeId>("ghost");
  useEffect(() => { const f = () => set(readTheme()); f(); window.addEventListener(EVT, f); window.addEventListener("storage", f); return () => { window.removeEventListener(EVT, f); window.removeEventListener("storage", f); }; }, []);
  return t;
}
