"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  applyTheme,
  isThemePreference,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./theme";

const ICONS: Record<ThemePreference, IconName> = {
  system: "monitor",
  light: "sun",
  dark: "moon",
};

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** Three-way theme switch: System, Light, Dark. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    // Sync with the value the boot script applied before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    setPreference(readStored());
  }, []);

  function choose(next: ThemePreference) {
    setPreference(next);
    applyTheme(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice still applies for this page view.
    }
  }

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex rounded-full border border-border bg-surface-muted p-1"
    >
      {THEME_OPTIONS.map((option) => {
        const selected = option.value === preference;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={compact ? `${option.label} theme` : undefined}
            onClick={() => choose(option.value)}
            className={[
              "inline-flex min-h-touch min-w-touch items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-(--fc-duration-fast)",
              selected
                ? "bg-surface text-text shadow-sm"
                : "text-text-muted hover:text-text",
            ].join(" ")}
          >
            <Icon name={ICONS[option.value]} className="size-4" />
            {compact ? null : <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
