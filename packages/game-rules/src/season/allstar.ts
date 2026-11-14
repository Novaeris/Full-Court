import { efficiency, type AwardLine } from "./awards";

/**
 * The All-Star Game (docs/DESIGN.md, "The All-Star Game"): half way through the
 * regular season the league's best players so far are picked, split into two
 * squads by a draft between the two best of them, and play one game. Pure:
 * the same numbers always give the same squads.
 */

/** The game is played before this day: half way through the regular season. */
export function allStarDay(lastDay: number): number {
  return Math.max(2, Math.floor(lastDay / 2));
}

/** Players picked in all, so each squad has this many. */
export const ALL_STARS = 24;
export const SQUAD_SIZE = ALL_STARS / 2;
/** The first few of a squad start the game. */
export const STARTERS = 5;

/** A player needs this share of the games the most-used player has played. */
export const ALL_STAR_MIN_GAMES = 0.5;

export type AllStarSquads = {
  /** Player ids, best first within a squad; the first five start. */
  a: string[];
  b: string[];
  /** The two best players, one captain for each squad. */
  captainA: string;
  captainB: string;
};

/**
 * Picks the all-stars from the season so far. The best by efficiency per game
 * (players who have played too few games are left out) go in, in order; the
 * best two are captains and the rest are drafted by turns, A first then B, B,
 * A, A, B... so the squads are even. Returns null when there aren't enough
 * players to fill two squads.
 */
export function pickAllStars(
  lines: readonly AwardLine[],
): AllStarSquads | null {
  const maxGames = Math.max(0, ...lines.map((l) => l.games));
  const minGames = Math.max(1, Math.ceil(maxGames * ALL_STAR_MIN_GAMES));
  const ranked = lines
    .filter((l) => l.games >= minGames)
    .sort(
      (x, y) =>
        efficiency(y) - efficiency(x) ||
        y.games - x.games ||
        (x.playerId < y.playerId ? -1 : 1),
    )
    .slice(0, ALL_STARS);
  if (ranked.length < ALL_STARS) return null;

  const a: string[] = [];
  const b: string[] = [];
  // A snake draft: A, B, B, A, A, B, B, A ... evens out the two squads.
  ranked.forEach((l, i) => {
    const turn = i % 4;
    (turn === 0 || turn === 3 ? a : b).push(l.playerId);
  });
  return {
    a,
    b,
    captainA: (ranked[0] as AwardLine).playerId,
    captainB: (ranked[1] as AwardLine).playerId,
  };
}

/** A player's line in the All-Star Game. */
export type AllStarLine = {
  playerId: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
};

/** The game's most valuable player: the best line on the winning squad. */
export function allStarMvp(winners: readonly AllStarLine[]): string | null {
  let best: AllStarLine | null = null;
  let bestScore = -Infinity;
  for (const l of winners) {
    const score =
      l.points + l.rebounds + l.assists + l.steals + l.blocks - l.turnovers;
    if (
      score > bestScore ||
      (score === bestScore && best && l.playerId < best.playerId)
    ) {
      best = l;
      bestScore = score;
    }
  }
  return best?.playerId ?? null;
}
