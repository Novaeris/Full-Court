/**
 * Versions of the policies people agree to or acknowledge.
 *
 * - Bump `version` only for a material change: one that changes what people
 *   agree to or what happens to their data. Signed-in players are then asked
 *   to accept or acknowledge again. Fix typos and wording without bumping.
 * - `updated` is the date shown on the page; change it with any edit.
 */
export const TERMS = { version: 1, updated: "2026-11-11" } as const;
export const PRIVACY = { version: 1, updated: "2026-11-11" } as const;
export const ACCEPTABLE_USE = { version: 1, updated: "2026-11-11" } as const;
export const ALPHA_DISCLAIMER = { version: 1, updated: "2026-11-11" } as const;

/**
 * The open-alpha notice. Shown on the home page, at sign-up, on first sign-in
 * and on /alpha. Players acknowledge `version`; a bump asks them again.
 */
export const ALPHA_NOTICE = {
  version: 1,
  title: "Full Court is in open alpha",
  summary:
    "The game is unfinished and changes often. Play it, break it and tell us what you find, but don't get attached to your saves yet.",
  points: [
    "The game is unfinished. Many features are missing or incomplete.",
    "Expect bugs, including ones that lose or corrupt your progress.",
    "Game balance, rules and features can change at any time, sometimes drastically.",
    "Saves and leagues may be reset or deleted without notice.",
    "The service may be slow or unavailable, including during maintenance.",
  ],
} as const;
