import {
  RATING_KEYS,
  type Position,
  type RatingKey,
  type Ratings,
} from "@fullcourt/game-types";
import {
  DRAFT_ROUNDS,
  LOTTERY_PICKS,
  MAX_PLAYER_AGE,
  UNDRAFTED_PROSPECTS,
  clampRating,
  computeOverall,
  draftNoise,
  expectedChange,
  lotteryWeights,
  playerValue,
  retirementChance,
} from "@fullcourt/game-rules";
import { normalSum, weighted } from "../rng/helpers";
import type { Rng } from "../rng/rng";
import {
  generateBody,
  generatePotential,
  generateRatings,
  uniqueName,
} from "../world/generate";

/**
 * The offseason's player steps, as pure functions of the league's players and a
 * seeded RNG: players age and some retire (`ageAndRetire`), a rookie class is
 * drafted (`holdDraft`). Rosters, camp and staff are in the files beside this
 * one. Nothing here knows about the database; every step returns a list of
 * what changed.
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

/** A player after ageing. A retired player has no team. */
export type Progressed = {
  id: string;
  age: number;
  jersey: number;
  ratings: Ratings;
  overall: number;
  potential: number;
  previousOverall: number;
  teamId: string | null;
  retired: boolean;
};

/** Step 1: every player ages a year, and some retire. */
export function ageAndRetire(
  rng: Rng,
  players: readonly OffseasonPlayer[],
): Progressed[] {
  return players.map((p) => {
    const next = progress(rng, p);
    const retired =
      next.age >= MAX_PLAYER_AGE ||
      rng.next() < retirementChance(next.age, next.overall, p.teamId !== null);
    return {
      id: p.id,
      age: next.age,
      jersey: p.jersey,
      ratings: next.ratings,
      overall: next.overall,
      potential: next.potential,
      previousOverall: p.overall,
      teamId: retired ? null : p.teamId,
      retired,
    };
  });
}

/** A prospect and, once the draft has run, where he went. */
export type Rookie = {
  key: number;
  firstName: string;
  lastName: string;
  position: Position;
  age: number;
  heightInches: number;
  weightPounds: number;
  jersey: number;
  ratings: Ratings;
  overall: number;
  potential: number;
  /** The team that drafted him; null if undrafted. */
  teamId: string | null;
  draft: { round: number; pick: number; teamId: string } | null;
};

/** The rookie class: enough for every pick plus a few undrafted. */
export function generateDraftClass(
  rng: Rng,
  size: number,
  takenNames: Set<string>,
): Rookie[] {
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
      ...uniqueName(rng, takenNames),
      position,
      age,
      ...generateBody(rng, position),
      jersey: 0,
      ratings,
      overall,
      potential: generatePotential(rng, age, overall),
      teamId: null,
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

export type DraftInput = {
  /** Every team, best regular-season record first. */
  standingsOrder: readonly string[];
  /** 0 for a team that missed the playoffs; else rounds played, plus one for the title. */
  playoffDepth: ReadonlyMap<string, number>;
  /** Every name already used in the league, including retired players. */
  takenNames: ReadonlySet<string>;
  /** Each team's scout rating, if it has a scout. A better scout means a clearer board. */
  scouts: ReadonlyMap<string, number | null>;
};

/**
 * Step 2: the lottery and the draft. Every team takes the best prospect on its
 * board, a blend of overall and potential that leans on potential for the
 * young, seen through the noise its scout leaves. Prospects not taken stay
 * undrafted (no team).
 */
export function holdDraft(
  rng: Rng,
  input: DraftInput,
): { rookies: Rookie[]; lottery: LotteryEntry[] } {
  const teams = input.standingsOrder;
  const prospects = generateDraftClass(
    rng,
    teams.length * DRAFT_ROUNDS + UNDRAFTED_PROSPECTS,
    new Set(input.takenNames),
  );
  const available = new Set(prospects.map((p) => p.key));
  const { order, entries } = draftOrder(
    rng,
    input.standingsOrder,
    input.playoffDepth,
  );
  let pickNumber = 0;
  for (let round = 1; round <= DRAFT_ROUNDS; round++) {
    for (const teamId of order) {
      pickNumber += 1;
      const noise = draftNoise(input.scouts.get(teamId) ?? null);
      let best: Rookie | null = null;
      let bestScore = -Infinity;
      for (const prospect of prospects) {
        if (!available.has(prospect.key)) continue;
        const score =
          playerValue(prospect.overall, prospect.potential, prospect.age) +
          normalSum(rng, 0, noise);
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
  return { rookies: prospects, lottery: entries };
}
