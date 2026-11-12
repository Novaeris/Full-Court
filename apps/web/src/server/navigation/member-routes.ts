/**
 * Keeps signed-in players inside the game frame (docs/ARCHITECTURE.md,
 * "Staying in the game"). Used by src/proxy.ts, before any page renders.
 *
 * - Public info pages (policies, about, changelog, support) keep their URLs,
 *   but members get them inside the app shell: the proxy rewrites to an
 *   internal copy under IN_GAME_PREFIX, which re-exports the same page.
 * - The landing page sends members to Game Mode Selection.
 * - The internal copies are never addressed directly; those URLs redirect to
 *   the public path.
 */

/** Public pages that members see inside the app shell. */
export const IN_GAME_PAGES = [
  "/about",
  "/acceptable-use",
  "/alpha",
  "/changelog",
  "/privacy",
  "/support",
  "/terms",
] as const;

/** Internal route folder holding the in-game copies: src/app/(app)/in-game. */
export const IN_GAME_PREFIX = "/in-game";

/** Where members go instead of the landing page. */
export const MEMBER_HOME = "/modes";

export type MemberRoute =
  | { type: "rewrite"; pathname: string }
  | { type: "redirect"; pathname: string }
  | null;

const PAGES = new Set<string>(IN_GAME_PAGES);

export function memberRoute(pathname: string, signedIn: boolean): MemberRoute {
  if (
    pathname === IN_GAME_PREFIX ||
    pathname.startsWith(`${IN_GAME_PREFIX}/`)
  ) {
    return {
      type: "redirect",
      pathname: pathname.slice(IN_GAME_PREFIX.length) || "/",
    };
  }
  if (!signedIn) return null;
  if (pathname === "/") return { type: "redirect", pathname: MEMBER_HOME };
  if (PAGES.has(pathname)) {
    return { type: "rewrite", pathname: `${IN_GAME_PREFIX}${pathname}` };
  }
  return null;
}
