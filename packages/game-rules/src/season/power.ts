/**
 * Power rankings (docs/DESIGN.md, "Power rankings"): every team ranked by how
 * good it looks right now, which is not quite the standings. A blend of its
 * record, how much it wins and loses by, and its last ten games. Pure.
 */

/** What a team's line needs. `lastTen` is "wins-losses" over its latest games. */
export type PowerInput = {
  teamId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  lastTen: string;
};

export type PowerRow = {
  teamId: string;
  /** 1 for the best team. */
  rank: number;
  /** 0 to 100. */
  score: number;
  /** Points scored less points allowed, per game. */
  margin: number;
  winPct: number;
  /** The share of its last ten games it won. */
  recent: number;
};

/** How much each part counts for. They add up to 1. */
export const POWER_WEIGHTS = {
  record: 0.45,
  margin: 0.35,
  recent: 0.2,
} as const;

/** A margin this big a game or more (either way) is as good (or bad) as it gets. */
export const POWER_MARGIN_CAP = 15;

const share = (wins: number, played: number, none = 0.5) =>
  played > 0 ? wins / played : none;

/** Ranks the teams, best first. A team with no games yet is a middling one. */
export function powerRankings(teams: readonly PowerInput[]): PowerRow[] {
  const rows = teams.map((t) => {
    const played = t.wins + t.losses;
    const winPct = share(t.wins, played);
    const margin = played > 0 ? (t.pointsFor - t.pointsAgainst) / played : 0;
    const [rw, rl] = t.lastTen.split("-").map((n) => Number(n));
    const recent = share(rw ?? 0, (rw ?? 0) + (rl ?? 0));
    // The margin, from -cap to +cap, as a share of what it could be.
    const marginShare =
      (Math.max(-POWER_MARGIN_CAP, Math.min(POWER_MARGIN_CAP, margin)) +
        POWER_MARGIN_CAP) /
      (2 * POWER_MARGIN_CAP);
    const score =
      100 *
      (POWER_WEIGHTS.record * winPct +
        POWER_WEIGHTS.margin * marginShare +
        POWER_WEIGHTS.recent * recent);
    return {
      teamId: t.teamId,
      score: Math.round(score * 10) / 10,
      margin: Math.round(margin * 10) / 10,
      winPct,
      recent,
    };
  });
  return rows
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.winPct - a.winPct ||
        (a.teamId < b.teamId ? -1 : 1),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
