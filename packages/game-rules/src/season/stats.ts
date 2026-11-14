/**
 * League leaders for the season being played (docs/DESIGN.md, "Statistics").
 * Pure: it ranks totals it is given. Ties go to the player with more games, then
 * the smaller id, so a page always lists the same players in the same order.
 */

/** A player's totals for a season with one team. */
export type StatTotals = {
  playerId: string;
  teamId: string;
  games: number;
  started: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
};

type PerGame = "points" | "rebounds" | "assists" | "steals" | "blocks";

type Category =
  | {
      id: string;
      label: string;
      kind: "per-game";
      stat: PerGame;
    }
  | {
      id: string;
      label: string;
      kind: "percent";
      made: "fgm" | "tpm" | "ftm";
      tried: "fga" | "tpa" | "fta";
      /** Attempts a game needed to qualify, so a player who took one shot doesn't lead. */
      perGame: number;
    };

export const LEADER_CATEGORIES: readonly Category[] = [
  { id: "points", label: "Points per game", kind: "per-game", stat: "points" },
  {
    id: "rebounds",
    label: "Rebounds per game",
    kind: "per-game",
    stat: "rebounds",
  },
  {
    id: "assists",
    label: "Assists per game",
    kind: "per-game",
    stat: "assists",
  },
  { id: "steals", label: "Steals per game", kind: "per-game", stat: "steals" },
  { id: "blocks", label: "Blocks per game", kind: "per-game", stat: "blocks" },
  {
    id: "field-goal",
    label: "Field goal percentage",
    kind: "percent",
    made: "fgm",
    tried: "fga",
    perGame: 3,
  },
  {
    id: "three-point",
    label: "Three-point percentage",
    kind: "percent",
    made: "tpm",
    tried: "tpa",
    perGame: 1,
  },
  {
    id: "free-throw",
    label: "Free throw percentage",
    kind: "percent",
    made: "ftm",
    tried: "fta",
    perGame: 1,
  },
];

/** Games a player needs to be ranked, as a share of the most any player has played. */
export const LEADER_MIN_GAMES = 0.5;

export type Leader = {
  playerId: string;
  teamId: string;
  games: number;
  /** Per game, or a percentage from 0 to 100, to one decimal. */
  value: number;
  /** Totals behind it: the total for a per-game stat, the makes for a percentage. */
  total: number;
};

export type LeaderBoard = {
  id: string;
  label: string;
  unit: "per game" | "percent";
  leaders: Leader[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The top `top` players in each category. A player who played for two teams is
 * one player: his rows are added together under the team he played most for.
 */
export function statLeaders(
  rows: readonly StatTotals[],
  top = 10,
): LeaderBoard[] {
  const merged = new Map<string, StatTotals>();
  const mostGames = new Map<string, number>();
  for (const r of rows) {
    const have = merged.get(r.playerId);
    if (!have) {
      merged.set(r.playerId, { ...r });
      mostGames.set(r.playerId, r.games);
      continue;
    }
    for (const key of Object.keys(r) as (keyof StatTotals)[]) {
      if (key === "playerId" || key === "teamId") continue;
      (have[key] as number) += r[key] as number;
    }
    if (r.games > (mostGames.get(r.playerId) ?? 0)) {
      have.teamId = r.teamId;
      mostGames.set(r.playerId, r.games);
    }
  }
  const players = [...merged.values()];
  const maxGames = Math.max(0, ...players.map((p) => p.games));
  const minGames = Math.max(1, Math.ceil(maxGames * LEADER_MIN_GAMES));
  const eligible = players.filter((p) => p.games >= minGames);

  return LEADER_CATEGORIES.map((c): LeaderBoard => {
    const entries: Leader[] = [];
    for (const p of eligible) {
      if (c.kind === "per-game") {
        entries.push({
          playerId: p.playerId,
          teamId: p.teamId,
          games: p.games,
          value: round1(p[c.stat] / p.games),
          total: p[c.stat],
        });
      } else if (p[c.tried] >= c.perGame * p.games && p[c.tried] > 0) {
        entries.push({
          playerId: p.playerId,
          teamId: p.teamId,
          games: p.games,
          value: round1((100 * p[c.made]) / p[c.tried]),
          total: p[c.made],
        });
      }
    }
    entries.sort(
      (a, b) =>
        b.value - a.value ||
        b.games - a.games ||
        (a.playerId < b.playerId ? -1 : 1),
    );
    return {
      id: c.id,
      label: c.label,
      unit: c.kind === "per-game" ? "per game" : "percent",
      leaders: entries.slice(0, top).filter((e) => e.value > 0),
    };
  });
}
