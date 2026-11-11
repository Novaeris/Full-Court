/**
 * Semantic color tokens. Components use these names, never raw values, so a
 * theme change (or a React Native port) only touches this file.
 */
export const colorTokenNames = [
  /** Page background. */
  "canvas",
  /** Cards, panels, navigation. */
  "surface",
  /** Subtle fills: table stripes, hovered rows, inputs. */
  "surface-muted",
  /** Dividers and outlines. */
  "border",
  /** Primary text. */
  "text",
  /** Secondary text, captions. */
  "text-muted",
  /** Brand accent: primary buttons, active navigation, links. */
  "accent",
  /** Accent for hover and pressed states. */
  "accent-strong",
  /** Text and icons placed on `accent`. */
  "on-accent",
  /** Tinted background for selected and highlighted items. */
  "accent-soft",
  /** Text placed on `accent-soft`. */
  "on-accent-soft",
  /** Keyboard focus ring. */
  "focus",
  /** Wins, positive changes. */
  "win",
  /** Losses, negative changes. */
  "loss",
  /** Warnings. */
  "warning",
  /** Destructive actions and errors. */
  "danger",
] as const;

export type ColorToken = (typeof colorTokenNames)[number];
export type ColorTheme = Record<ColorToken, string>;
export type ThemeName = "light" | "dark";

export const colors: Record<ThemeName, ColorTheme> = {
  light: {
    canvas: "#f6f4f1",
    surface: "#ffffff",
    "surface-muted": "#efece7",
    border: "#d6d0c7",
    text: "#1b1d22",
    "text-muted": "#545a68",
    accent: "#c2410c",
    "accent-strong": "#9a3412",
    "on-accent": "#ffffff",
    "accent-soft": "#fdebdd",
    "on-accent-soft": "#7c2d12",
    focus: "#2563eb",
    win: "#15803d",
    loss: "#b91c1c",
    warning: "#8a5a00",
    danger: "#b91c1c",
  },
  dark: {
    canvas: "#0e1116",
    surface: "#161a21",
    "surface-muted": "#1f242d",
    border: "#323946",
    text: "#eceef2",
    "text-muted": "#a3a9b6",
    accent: "#f97316",
    "accent-strong": "#fb923c",
    "on-accent": "#111317",
    "accent-soft": "#3a2416",
    "on-accent-soft": "#fed7aa",
    focus: "#60a5fa",
    win: "#4ade80",
    loss: "#f87171",
    warning: "#facc15",
    danger: "#f87171",
  },
};

/**
 * Foreground/background pairs that must meet WCAG AA in both themes.
 * `min` is 4.5 for text, 3 for large text and UI components.
 */
export const contrastRequirements: readonly {
  fg: ColorToken;
  bg: ColorToken;
  min: number;
}[] = [
  { fg: "text", bg: "canvas", min: 4.5 },
  { fg: "text", bg: "surface", min: 4.5 },
  { fg: "text", bg: "surface-muted", min: 4.5 },
  { fg: "text-muted", bg: "canvas", min: 4.5 },
  { fg: "text-muted", bg: "surface", min: 4.5 },
  { fg: "text-muted", bg: "surface-muted", min: 4.5 },
  { fg: "accent", bg: "canvas", min: 4.5 },
  { fg: "accent", bg: "surface", min: 4.5 },
  { fg: "on-accent", bg: "accent", min: 4.5 },
  { fg: "on-accent", bg: "accent-strong", min: 4.5 },
  { fg: "on-accent-soft", bg: "accent-soft", min: 4.5 },
  { fg: "win", bg: "surface", min: 4.5 },
  { fg: "loss", bg: "surface", min: 4.5 },
  { fg: "warning", bg: "surface", min: 4.5 },
  { fg: "danger", bg: "surface", min: 4.5 },
  // Destructive buttons: surface-colored text on danger.
  { fg: "surface", bg: "danger", min: 4.5 },
  { fg: "focus", bg: "canvas", min: 3 },
  { fg: "focus", bg: "surface", min: 3 },
];

/** WCAG relative luminance of a #rrggbb color. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) {
    throw new Error(`Expected a #rrggbb color, got "${hex}"`);
  }
  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
    (c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    },
  );
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
