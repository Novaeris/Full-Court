import {
  RATING_KEYS,
  type Position,
  type RatingKey,
  type Ratings,
} from "@fullcourt/game-types";
import {
  DRAFT_ROUNDS,
  LOTTERY_PICKS,
  lotteryWeights,
  MAX_PLAYER_AGE,
  ROSTER_LIMITS,
  UNDRAFTED_PROSPECTS,
  clampRating,
  computeOverall,
  expectedChange,
  playerValue,
  retirementChance,
} from "@fullcourt/game-rules";
import { normalSum, shuffle, weighted } from "../rng/helpers";
import type { Rng } from "../rng/rng";
import {
  generateBody,
  generatePotential,
  generateRatings,
  uniqueName,
} from "../world/generate";

/**
 * One offseason, as pure functions of the league's players and a seeded RNG:
 * players age and change, some retire, a rookie class is drafted, and every
 * team's roster is brought back to full size. Nothing here knows about the
 * database; the result is a list of what changed.
 */

export type OffseasonPlayer = {
  id: string;
  /** null for a free agent. */
  teamId: string | null;
  firstName: string;
  lastName: string;
  position: Position;
  age: number;
  jersey: number;
  ratings: Ratings;
  overall: number;
  potential: number;
};

export type OffseasonInput = {
  /** Every team, best regular-season record first. */
  standingsOrder: readonly string[];
  /** 0 for a team that missed the playoffs; else rounds played, plus one for the title. */
  playoffDepth: ReadonlyMap<string, number>;
  /** Every active player, on a team or free. */
  players: readonly OffseasonPlayer[];
  /** Every name already used in the league, including retired players. */
  takenNames: ReadonlySet<string>;
};

/** A player after the offseason. `id` is null for a drafted rookie (a new row). */
export type OffseasonResult = {
  id: string | null;
  firstName: string;
  lastName: string;
  position: Position;
  age: number;
  /** Only set for rookies, who are new rows. */
  heightInches: number | null;
  weightPounds: number | null;
  jersey: number;
  ratings: Ratings;
  overall: number;
  potential: number;
  /** The overall before this offseason; null for a rookie. */
  previousOverall: number | null;
  teamId: string | null;
  retired: boolean;
  /** Where a rookie was taken, if drafted. */
  draft: { round: number; pick: number; teamId: string } | null;
};

export type OffseasonOutput = {
  players: OffseasonResult[];
  /** How each team's draft position came about. */
  lottery: LotteryEntry[];
};

/** A player below this value is not worth a roster place a team doesn't need. */
const REPLACEMENT_LEVEL = 57;

const ATHLETIC: readonly RatingKey[] = ["speed", "strength", "stamina"];
const SKILL: readonly RatingKey[] = [
  "midRange",
  "threePoint",
  "freeThrow",
  "passing",
  "ballHandling",
];

/** A year older: ratings drift with age and settle towards potential. */
export function progress(
  rng: Rng,
  player: Pick<
    OffseasonPlayer,
    "position" | "age" | "ratings" | "overall" | "potential"
  >,
): { age: number; ratings: Ratings; overall: number; potential: number } {
  const age = player.age + 1;
  let change = expectedChange(player.age) + normalSum(rng, 0, 1.6);
  // A young player can't grow far past his potential.
  if (player.age <= 25) {
    change = Math.min(change, player.potential - player.overall + 2);
  }
  const target = clampRating(player.overall + change);

  const ratings = {} as Ratings;
  for (const key of RATING_KEYS) {
    let shift = change + normalSum(rng, 0, 1.2);
    if (ATHLETIC.includes(key)) {
      shift += player.age >= 29 ? -(player.age - 28) * 0.5 : 0.5;
    } else if (SKILL.includes(key) && player.age >= 30) {
      shift += 0.5;
    }
    ratings[key] = clampRating(player.ratings[key] + shift);
  }
  // Settle the overall on the target, as when players are first made.
  const adjust = Math.round(target - computeOverall(player.position, ratings));
  for (const key of RATING_KEYS) {
    ratings[key] = clampRating(ratings[key] + adjust);
  }
  const overall = computeOverall(player.position, ratings);
  const potential =
    player.age >= 26
      ? overall
      : Math.max(
          overall,
          clampRating(player.potential + Math.round(normalSum(rng, 0, 1.5))),
        );
  return { age, ratings, overall, potential };
}

type Prospect = OffseasonResult & { key: number };

/** The rookie class: enough for every pick plus a few undrafted. */
export function generateDraftClass(
  rng: Rng,
  size: number,
  takenNames: Set<string>,
): Prospect[] {
  const positions = ["PG", "SG", "SF", "PF", "C"] as const;
  return Array.from({ length: size }, (_, key) => {
    const position = positions[rng.int(0, positions.length - 1)] as Position;
    const age = weighted(rng, [
      [19, 30],
      [20, 30],
      [21, 25],
      [22, 15],
    ] as const);
    const target = Math.round(
      Math.min(72, Math.max(38, normalSum(rng, 49, 6.5))),
    );
    const ratings = generateRatings(rng, position, target);
    const overall = computeOverall(position, ratings);
    return {
      key,
      id: null,
      ...uniqueName(rng, takenNames),
      position,
      age,
      ...generateBody(rng, position),
      jersey: 0,
      ratings,
      overall,
      potential: generatePotential(rng, age, overall),
      previousOverall: null,
      teamId: null,
      retired: false,
      draft: null,
    };
  });
}

/** How a team's draft position came about. */
export type LotteryEntry = {
  teamId: string;
  /** Where the team finished, 1 = best, out of every team. */
  finishRank: number;
  /** The pick it would have had without the lottery, 1 = first. */
  expectedPick: number;
  /** Its chance of the first pick; null for a team that made the playoffs. */
  odds: number | null;
  /** The pick it got. */
  pick: number;
};

/**
 * The order of the picks in one round, from how every team finished.
 *
 * Teams that missed the playoffs are in the lottery, worst record first. The
 * first LOTTERY_PICKS picks are drawn from them with the odds in
 * `lotteryOdds` (the worst teams have the best chance, no team is sure of
 * anything); the rest of the lottery teams follow in record order. Playoff
 * teams pick after them, ordered by how far they got: teams knocked out
 * earlier pick first, the finalist and the champion last, with the worse
 * record first among teams that went equally far.
 *
 * `playoffDepth` is 0 for a team that missed the playoffs, then the number of
 * rounds the team played, plus one for winning the title.
 */
export function draftOrder(
  rng: Rng,
  standingsOrder: readonly string[],
  playoffDepth: ReadonlyMap<string, number>,
): { order: string[]; entries: LotteryEntry[] } {
  const worstFirst = [...standingsOrder].reverse();
  const depth = (team: string) => playoffDepth.get(team) ?? 0;
  const lottery = worstFirst.filter((t) => depth(t) === 0);
  const playoff = worstFirst
    .filter((t) => depth(t) > 0)
    .sort(
      (a, b) =>
        depth(a) - depth(b) || worstFirst.indexOf(a) - worstFirst.indexOf(b),
    );
  const expected = [...lottery, ...playoff];

  const weights = lotteryWeights(lottery.length);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const pool = lottery.map((team, i) => ({
    team,
    weight: weights[i] as number,
  }));
  const top: string[] = [];
  const draws = Math.min(LOTTERY_PICKS, pool.length);
  for (let i = 0; i < draws; i++) {
    const winner = weighted(
      rng,
      pool.map((entry) => [entry.team, entry.weight] as const),
    );
    top.push(winner);
    pool.splice(
      pool.findIndex((entry) => entry.team === winner),
      1,
    );
  }
  const order = [...top, ...pool.map((entry) => entry.team), ...playoff];
  const entries = expected.map((teamId, index) => ({
    teamId,
    finishRank: standingsOrder.indexOf(teamId) + 1,
    expectedPick: index + 1,
    odds: index < lottery.length ? (weights[index] as number) / total : null,
    pick: order.indexOf(teamId) + 1,
  }));
  return { order, entries };
}

function freeJersey(rng: Rng, used: ReadonlySet<number>): number {
  const free = shuffle(
    rng,
    Array.from({ length: 100 }, (_, n) => n),
  ).find((n) => !used.has(n));
  return free ?? 0;
}

/** Runs the whole offseason. The same input and RNG always give the same output. */
export function runOffseason(rng: Rng, input: OffseasonInput): OffseasonOutput {
  const teams = [...input.standingsOrder];
  const taken = new Set(input.takenNames);

  // 1. Everyone ages a year; some retire.
  const kept: OffseasonResult[] = [];
  const out: OffseasonResult[] = [];
  for (const p of input.players) {
    const next = progress(rng, p);
    const retired =
      next.age >= MAX_PLAYER_AGE ||
      rng.next() < retirementChance(next.age, next.overall, p.teamId !== null);
    const result: OffseasonResult = {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      age: next.age,
      heightInches: null,
      weightPounds: null,
      jersey: p.jersey,
      ratings: next.ratings,
      overall: next.overall,
      potential: next.potential,
      previousOverall: p.overall,
      teamId: retired ? null : p.teamId,
      retired,
      draft: null,
    };
    out.push(result);
    if (!retired) kept.push(result);
  }

  // 2. The draft: every team sees the same board, with a little noise.
  const picks = teams.length * DRAFT_ROUNDS;
  const prospects = generateDraftClass(rng, picks + UNDRAFTED_PROSPECTS, taken);
  const available = new Set(prospects.map((p) => p.key));
  const { order, entries: lottery } = draftOrder(
    rng,
    input.standingsOrder,
    input.playoffDepth,
  );
  let pickNumber = 0;
  for (let round = 1; round <= DRAFT_ROUNDS; round++) {
    for (const teamId of order) {
      pickNumber += 1;
      let best: Prospect | null = null;
      let bestScore = -Infinity;
      for (const prospect of prospects) {
        if (!available.has(prospect.key)) continue;
        const score =
          playerValue(prospect.overall, prospect.potential, prospect.age) +
          normalSum(rng, 0, 2);
        if (score > bestScore) {
          bestScore = score;
          best = prospect;
        }
      }
      if (!best) break;
      available.delete(best.key);
      best.teamId = teamId;
      best.draft = { round, pick: pickNumber, teamId };
    }
  }
  // Rookies not taken stay in the pool as undrafted free agents.
  for (const rookie of prospects) {
    kept.push(rookie);
    out.push(rookie);
  }

  // 3. Rosters. A team may carry from ROSTER_LIMITS.min to ROSTER_LIMITS.max
  // players: it releases its weakest above the maximum, and signs free agents
  // (worst team first) only up to the size its front office aims for, which
  // differs from team to team but is never below the minimum.
  const byTeam = new Map<string, OffseasonResult[]>(teams.map((t) => [t, []]));
  for (const p of kept) {
    if (p.teamId) byTeam.get(p.teamId)?.push(p);
  }
  const value = (p: OffseasonResult) =>
    playerValue(p.overall, p.potential, p.age);
  for (const roster of byTeam.values()) {
    roster.sort((a, b) => value(b) - value(a));
    for (const cut of roster.splice(ROSTER_LIMITS.max)) cut.teamId = null;
  }
  const pool = kept.filter((p) => p.teamId === null);
  for (const teamId of [...teams].reverse()) {
    const roster = byTeam.get(teamId) as OffseasonResult[];
    const target = rng.int(ROSTER_LIMITS.min, ROSTER_LIMITS.max);
    // A team above its target lets go of players who are not worth a place.
    while (roster.length > Math.max(target, ROSTER_LIMITS.min)) {
      const weakest = roster[roster.length - 1] as OffseasonResult;
      if (value(weakest) >= REPLACEMENT_LEVEL) break;
      roster.pop();
      weakest.teamId = null;
      pool.push(weakest);
    }
    while (roster.length < target && pool.length > 0) {
      const counts = new Map<Position, number>();
      for (const p of roster) {
        counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
      }
      // Prefer a position the team is short of; otherwise the best player.
      let best = 0;
      let bestScore = -Infinity;
      pool.forEach((p, i) => {
        const score = value(p) - (counts.get(p.position) ?? 0) * 4;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      const [signed] = pool.splice(best, 1) as [OffseasonResult];
      signed.teamId = teamId;
      roster.push(signed);
    }
  }

  // 4. Jersey numbers: players keep theirs unless a teammate already wears it
  // (veterans are placed first); new faces take a free one.
  for (const roster of byTeam.values()) {
    const used = new Set<number>();
    const ordered = [
      ...roster.filter((p) => p.id !== null),
      ...roster.filter((p) => p.id === null),
    ];
    for (const p of ordered) {
      if (p.id === null || used.has(p.jersey)) p.jersey = freeJersey(rng, used);
      used.add(p.jersey);
    }
  }
  for (const p of kept) {
    if (p.id === null && p.teamId === null) p.jersey = rng.int(0, 99);
  }
  return { players: out, lottery };
}
