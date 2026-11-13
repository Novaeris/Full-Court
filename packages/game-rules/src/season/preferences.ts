/**
 * What a free agent cares about besides money (docs/DESIGN.md, "Free agency
 * day by day"). Each player has priorities that never change: how much the
 * money matters to him and how much he cares about winning, the role he would
 * have, the city, and the franchise's history. A team's appeal on those makes
 * its offer worth more or less to him than the salary alone: a winning team
 * with a starting job can beat a better-paying team that offers none of it.
 */

export const FA_FACTORS = ["winning", "role", "market", "history"] as const;
export type FaFactor = (typeof FA_FACTORS)[number];

export type Priorities = Record<"money" | FaFactor, number>;

export const FACTOR_LABELS: Record<"money" | FaFactor, string> = {
  money: "Money",
  winning: "Winning",
  role: "A big role",
  market: "The city",
  history: "Franchise history",
};

/** FNV-1a: a stable 32-bit hash of a string. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A small seeded generator (mulberry32), exact on every platform. */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A player's priorities, fixed by his id so they never change and need no
 * storage. Money counts for 20% to 60% of what he cares about; the rest is
 * shared at random between winning, role, the city and franchise history.
 */
export function playerPriorities(playerId: string): Priorities {
  const next = stream(hash32(`priorities:${playerId}`));
  const money = 0.2 + next() * 0.4;
  const raw = FA_FACTORS.map(() => 0.05 + next());
  const total = raw.reduce((s, r) => s + r, 0);
  const out = { money } as Priorities;
  FA_FACTORS.forEach((factor, i) => {
    out[factor] = ((raw[i] as number) / total) * (1 - money);
  });
  return out;
}

/** The two things he cares about most, most important first. */
export function topPriorities(
  priorities: Priorities,
  count = 2,
): ("money" | FaFactor)[] {
  return (Object.keys(priorities) as ("money" | FaFactor)[])
    .sort((a, b) => priorities[b] - priorities[a])
    .slice(0, count);
}

/**
 * How big a role a player would have on a team: 1 for a starter (one of the
 * team's five best), 0.6 for the rotation (next three), 0.2 on the bench.
 * `rosterValues` is the value of every player under contract, best first.
 */
export function roleScore(
  value: number,
  rosterValues: readonly number[],
): number {
  const better = rosterValues.filter((v) => v > value).length;
  if (better < 5) return 1;
  if (better < 8) return 0.6;
  return 0.2;
}

export function roleLabel(score: number): "starter" | "rotation" | "bench" {
  return score >= 1 ? "starter" : score >= 0.6 ? "rotation" : "bench";
}

/** How a team looks to a free agent on each factor, each from 0 to 1 (0.5 is average). */
export type Appeal = Record<FaFactor, number>;

/**
 * What an offer is worth to him: the salary, raised or lowered by how the
 * team's appeal compares with average on the things he cares about. The
 * biggest swing is 24% either way (for a player who cares about little but
 * non-money factors).
 */
export function effectiveSalary(
  salary: number,
  priorities: Priorities,
  appeal: Appeal,
): number {
  let swing = 0;
  for (const factor of FA_FACTORS) {
    swing += priorities[factor] * (appeal[factor] - 0.5);
  }
  return salary * (1 + 0.6 * swing);
}

/** A team's winning score from where it finished: 1 for the best record, 0 for the worst, plus a deep playoff run. */
export function winningScore(
  finishRank: number,
  teams: number,
  playoffDepth: number,
): number {
  const base = teams <= 1 ? 0.5 : 1 - (finishRank - 1) / (teams - 1);
  return Math.min(
    1,
    Math.max(0, base * 0.8 + Math.min(playoffDepth, 4) * 0.05),
  );
}

/**
 * A franchise's history from its recent seasons: titles and finals count most,
 * playoff seasons some, and missing the playoffs costs a little. Neutral
 * (0.5) for a franchise with no history yet.
 */
export function historyScore(seasons: {
  titles: number;
  finals: number;
  playoffs: number;
  missed: number;
}): number {
  const played = seasons.playoffs + seasons.missed;
  if (played === 0) return 0.5;
  return Math.min(
    1,
    Math.max(
      0,
      0.4 +
        seasons.titles * 0.2 +
        seasons.finals * 0.1 +
        seasons.playoffs * 0.04 -
        seasons.missed * 0.03,
    ),
  );
}

/** The city's appeal: 1 for the biggest market in the league, 0 for the smallest. */
export function marketScore(rankInLeague: number, teams: number): number {
  return teams <= 1 ? 0.5 : 1 - rankInLeague / (teams - 1);
}
