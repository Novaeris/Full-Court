import type { PlayoffConfig, SeriesLength } from "@fullcourt/game-types";
import type { PlayoffPool } from "../owner-mode/playoffs";

/**
 * The playoff bracket: a single-elimination tree of best-of series. Seeding
 * (who is in, and in what order) is `seedPlayoffTeams`; this turns the seeds
 * into series. See docs/DESIGN.md, "Playoffs".
 *
 * Series sit in a binary tree. Round 1 has slots 0 to n/2 - 1; the winners of
 * slots 2k and 2k + 1 meet in slot k of the next round. With conference
 * seeding the conferences fill neighbouring slots, so they meet only in the
 * final round.
 */

/** A team in the bracket. */
export type BracketTeam = {
  teamId: string;
  /** Seed within its pool (conference or league), 1 is best. */
  seed: number;
  /** Place in the whole league's regular-season standings, 1 is best. */
  rank: number;
};

export type BracketSeries = {
  round: number;
  slot: number;
  a: BracketTeam;
  b: BracketTeam;
  bestOf: SeriesLength;
};

/**
 * The order seeds meet in a pool of `n` (a power of two), as pairs: for eight,
 * 1 v 8, 4 v 5, 2 v 7, 3 v 6, so the best seeds can only meet late.
 */
export function bracketOrder(n: number): number[] {
  if (!Number.isInteger(n) || n < 1 || (n & (n - 1)) !== 0) {
    throw new Error("A bracket needs a power of two teams.");
  }
  let order = [1];
  while (order.length < n) {
    const total = order.length * 2;
    order = order.flatMap((s) => [s, total + 1 - s]);
  }
  return order;
}

/**
 * Round one of the playoffs. `standings` lists every team best-first and sets
 * each team's `rank` (and so who has home court). Throws on a pool whose size
 * isn't a power of two or a seeded team that isn't in the standings.
 */
export function buildFirstRound(
  pools: readonly PlayoffPool[],
  standings: readonly string[],
  config: Pick<PlayoffConfig, "roundSeriesLengths">,
): BracketSeries[] {
  const rank = new Map(standings.map((teamId, i) => [teamId, i + 1]));
  const series: BracketSeries[] = [];
  const bestOf = config.roundSeriesLengths[0] ?? 7;
  for (const pool of pools) {
    const bySeed = new Map(pool.seeds.map((s) => [s.seed, s]));
    const order = bracketOrder(pool.seeds.length);
    for (let i = 0; i < order.length; i += 2) {
      const teams = [order[i], order[i + 1]].map((seed) => {
        const entry = bySeed.get(seed as number);
        const place = entry ? rank.get(entry.teamId) : undefined;
        if (!entry || place === undefined) {
          throw new Error(`Seed ${seed} isn't in the standings.`);
        }
        return { teamId: entry.teamId, seed: entry.seed, rank: place };
      });
      series.push({
        round: 1,
        slot: series.length,
        a: teams[0] as BracketTeam,
        b: teams[1] as BracketTeam,
        bestOf,
      });
    }
  }
  return series;
}

/** Rounds in a bracket of `teams` (a power of two). */
export function roundCount(teams: number): number {
  return Math.log2(teams);
}

/** Games a team must win to take a best-of series. */
export function winsNeeded(bestOf: SeriesLength): number {
  return (bestOf + 1) / 2;
}

/** The series length for a round (first round is 1), from the league's setup. */
export function bestOfForRound(
  config: Pick<PlayoffConfig, "roundSeriesLengths">,
  round: number,
): SeriesLength {
  return (
    config.roundSeriesLengths[round - 1] ??
    config.roundSeriesLengths.at(-1) ??
    7
  );
}

/**
 * Who hosts each game of a series: `true` means the team with the better
 * regular-season record. Best of 7 is 2-2-1-1-1, best of 5 is 2-2-1 and best
 * of 3 is 1-1-1. Mirrored by `app_private.playoff_home_game` in the database.
 */
export function homeGamePattern(bestOf: SeriesLength): boolean[] {
  const pattern = [true, true, false, false, true, false, true];
  return bestOf === 3 ? [true, false, true] : pattern.slice(0, bestOf);
}

/** The slot a series' winner moves to, and the series it meets there. */
export function nextSlot(slot: number): { slot: number; sibling: number } {
  return { slot: slot >> 1, sibling: slot ^ 1 };
}

/** "First round", "Conference finals", "Finals" and so on. */
export function roundLabel(
  round: number,
  rounds: number,
  seeding: PlayoffConfig["seeding"],
): string {
  if (round === rounds) return "Finals";
  if (round === 1) return "First round";
  const fromEnd = rounds - round;
  if (fromEnd === 1) {
    return seeding === "conference" ? "Conference finals" : "Semifinals";
  }
  if (fromEnd === 2) {
    return seeding === "conference" ? "Conference semifinals" : "Quarterfinals";
  }
  return `Round ${round}`;
}
