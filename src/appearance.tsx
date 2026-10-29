import type { Profile } from "../shared/schema";
import { COLORS } from "../shared/states";
export const candidateColor = (candidate: Profile | undefined, index: number) =>
  candidate?.color || COLORS[index % COLORS.length];
export function Swatch({ color }: { color: string }) {
  return (
    <svg className="dot" viewBox="0 0 10 10" aria-hidden="true">
      <rect width="10" height="10" rx="2" fill={color} />
    </svg>
  );
}
export const THEMES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "discord", label: "Discord" },
  { id: "dark", label: "Dark (black)" },
  { id: "oled", label: "OLED (true black)" },
  { id: "midnight", label: "Midnight teal" },
  { id: "sepia", label: "Sepia" },
] as const;
export type Theme = (typeof THEMES)[number]["id"];
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("atlas-theme");
    if (THEMES.some((t) => t.id === saved)) return saved as Theme;
  } catch {
    /* Storage may be disabled. */
  }
  return "system";
}
export function applyTheme(theme: Theme, systemDark: boolean) {
  document.documentElement.dataset.theme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;
}
