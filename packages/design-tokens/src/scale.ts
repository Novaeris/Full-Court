/**
 * Non-color tokens. Sizes are unitless pixels so every platform can use them:
 * the web generator converts to rem, React Native uses the numbers directly.
 */

/** Minimum widths, in px. Phones are everything below `tablet`. */
export const breakpoints = {
  tablet: 640,
  desktop: 1024,
  wide: 1440,
} as const;
export type Breakpoint = keyof typeof breakpoints;

/** Corner radius, in px. */
export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

/** Type scale: [font size, line height], in px. */
export const fontSize = {
  xs: [12, 16],
  sm: [14, 20],
  base: [16, 24],
  lg: [18, 28],
  xl: [20, 28],
  "2xl": [24, 32],
  "3xl": [30, 36],
  "4xl": [36, 40],
  "5xl": [48, 52],
} as const satisfies Record<string, readonly [number, number]>;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 800,
} as const;

/** Animation durations, in ms. Platforms must honour reduced-motion settings. */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/** Stacking order. */
export const zIndex = {
  nav: 40,
  overlay: 50,
  toast: 60,
} as const;

/** Layout constants, in px. */
export const layout = {
  /** Smallest comfortable touch target (WCAG 2.5.5 / platform guidelines). */
  touchTarget: 44,
  /** Desktop sidebar width. */
  sidebar: 240,
  /** Tablet icon rail width. */
  rail: 80,
  /** Phone bottom tab bar height, before the safe-area inset. */
  tabBar: 64,
  /** Widest a page's content column grows. */
  contentMax: 1200,
  /** Widest a column of running text grows. */
  proseMax: 680,
} as const;
