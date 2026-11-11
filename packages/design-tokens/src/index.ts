/**
 * Design tokens shared by every platform. Phase 1 adds the full semantic
 * palette, type scale and the generator that writes web CSS variables.
 */
export const breakpoints = {
  /** Phones are everything below `tablet`. */
  tablet: 640,
  desktop: 1024,
  wide: 1440,
} as const;

export type Breakpoint = keyof typeof breakpoints;
