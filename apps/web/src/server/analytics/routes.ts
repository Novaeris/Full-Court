/**
 * Reduces a pathname to the route it belongs to, so analytics count pages,
 * not people: /leagues/6f1d…/roster becomes /leagues/[leagueId]/roster.
 * Unknown paths collapse into one bucket, which keeps the totals table small
 * and stops anyone filling it with made-up paths.
 */
export const ROUTE_PATTERNS = [
  "/",
  "/about",
  "/acceptable-use",
  "/account",
  "/account-deleted",
  "/alpha",
  "/changelog",
  "/forgot-password",
  "/leagues",
  "/leagues/new",
  "/leagues/[leagueId]",
  "/leagues/[leagueId]/players/[playerId]",
  "/leagues/[leagueId]/roster",
  "/leagues/[leagueId]/schedule",
  "/leagues/[leagueId]/settings",
  "/leagues/[leagueId]/standings",
  "/leagues/[leagueId]/teams",
  "/leagues/[leagueId]/teams/[teamId]",
  "/login",
  "/privacy",
  "/reset-password",
  "/signup",
  "/styleguide",
  "/support",
  "/terms",
] as const;

export const OTHER_ROUTE = "/(other)";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PATTERNS = ROUTE_PATTERNS.map((pattern) => ({
  pattern,
  segments: pattern.split("/").filter(Boolean),
}));

export function routePattern(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  for (const candidate of PATTERNS) {
    if (candidate.segments.length !== segments.length) continue;
    const matches = candidate.segments.every((expected, index) => {
      const actual = segments[index] ?? "";
      return expected.startsWith("[") ? UUID.test(actual) : expected === actual;
    });
    if (matches) return candidate.pattern;
  }
  return OTHER_ROUTE;
}
