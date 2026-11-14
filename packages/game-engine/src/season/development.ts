import {
  RATING_KEYS,
  type Position,
  type RatingKey,
  type Ratings,
} from "@fullcourt/game-types";
import {
  DEVELOPMENT_STEPS,
  IN_SEASON_SHARE,
  clampRating,
  computeOverall,
  expectedChange,
} from "@fullcourt/game-rules";
import { normalSum } from "../rng/helpers";
import type { Rng } from "../rng/rng";

/**
 * One step of development during the season, as a pure function of the
 * players and a seeded RNG. Every active player is treated alike (a computer
 * team's players and the owner's, a free agent): his ratings move by their
 * share of the year's expected change for his age, plus some luck, and a young
 * player can't grow far past his potential. Age and potential don't change
 * until the offseason.
 */

export type DevelopingPlayer = {
  id: string;
  position: Position;
  age: number;
  ratings: Ratings;
  overall: number;
  potential: number;
};

export type Developed = {
  id: string;
  ratings: Ratings;
  overall: number;
};

const ATHLETIC: readonly RatingKey[] = ["speed", "strength", "stamina"];

/** Luck in a step, in rating points: small, so a year's total is still mostly the offseason's. */
const OVERALL_SD = 0.55;
const RATING_SD = 0.6;

export function developPlayers(
  rng: Rng,
  players: readonly DevelopingPlayer[],
): Developed[] {
  const share = IN_SEASON_SHARE / DEVELOPMENT_STEPS;
  const out: Developed[] = [];
  for (const p of players) {
    let change = expectedChange(p.age) * share + normalSum(rng, 0, OVERALL_SD);
    if (p.age <= 25) change = Math.min(change, p.potential - p.overall + 2);
    const target = clampRating(p.overall + change);

    const ratings = {} as Ratings;
    for (const key of RATING_KEYS) {
      let shift = change + normalSum(rng, 0, RATING_SD);
      // The body ages faster than the touch, as in the offseason.
      if (ATHLETIC.includes(key) && p.age >= 29) shift -= (p.age - 28) * 0.15;
      ratings[key] = clampRating(p.ratings[key] + shift);
    }
    // Settle the overall on the target.
    const adjust = Math.round(target - computeOverall(p.position, ratings));
    for (const key of RATING_KEYS) {
      ratings[key] = clampRating(ratings[key] + adjust);
    }
    const overall = computeOverall(p.position, ratings);
    const changed =
      overall !== p.overall ||
      RATING_KEYS.some((k) => ratings[k] !== p.ratings[k]);
    if (changed) out.push({ id: p.id, ratings, overall });
  }
  return out;
}
