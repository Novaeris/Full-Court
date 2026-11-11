/** Theme preference. "system" follows the operating system. */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "fc-theme";

export const THEME_OPTIONS: readonly {
  value: ThemePreference;
  label: string;
}[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Applies a preference to <html data-theme>. No attribute means "system". */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
}

/**
 * Inline script that runs before first paint, so a saved theme never flashes
 * the wrong colors. Kept tiny and dependency-free; storage may be blocked.
 */
export const themeBootScript = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;
