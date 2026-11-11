import {
  RATING_KEYS,
  RATING_MAX,
  RATING_MIN,
  type Position,
  type RatingKey,
  type Ratings,
} from "@fullcourt/game-types";

/**
 * How much each attribute counts towards a player's overall rating, by
 * position. Each row sums to 1, so the overall is a weighted average that
 * stays on the same 25–99 scale as the attributes.
 */
export const OVERALL_WEIGHTS: Record<Position, Record<RatingKey, number>> = {
  PG: {
    inside: 0.07,
    midRange: 0.1,
    threePoint: 0.13,
    freeThrow: 0.04,
    passing: 0.18,
    ballHandling: 0.16,
    offRebound: 0.01,
    defRebound: 0.03,
    perimeterD: 0.1,
    interiorD: 0.01,
    speed: 0.11,
    strength: 0.02,
    stamina: 0.04,
  },
  SG: {
    inside: 0.09,
    midRange: 0.13,
    threePoint: 0.17,
    freeThrow: 0.05,
    passing: 0.08,
    ballHandling: 0.11,
    offRebound: 0.02,
    defRebound: 0.04,
    perimeterD: 0.12,
    interiorD: 0.02,
    speed: 0.09,
    strength: 0.04,
    stamina: 0.04,
  },
  SF: {
    inside: 0.11,
    midRange: 0.11,
    threePoint: 0.12,
    freeThrow: 0.04,
    passing: 0.07,
    ballHandling: 0.07,
    offRebound: 0.05,
    defRebound: 0.07,
    perimeterD: 0.12,
    interiorD: 0.06,
    speed: 0.07,
    strength: 0.07,
    stamina: 0.04,
  },
  PF: {
    inside: 0.15,
    midRange: 0.08,
    threePoint: 0.06,
    freeThrow: 0.03,
    passing: 0.05,
    ballHandling: 0.03,
    offRebound: 0.1,
    defRebound: 0.13,
    perimeterD: 0.05,
    interiorD: 0.13,
    speed: 0.04,
    strength: 0.11,
    stamina: 0.04,
  },
  C: {
    inside: 0.18,
    midRange: 0.04,
    threePoint: 0.02,
    freeThrow: 0.03,
    passing: 0.04,
    ballHandling: 0.02,
    offRebound: 0.12,
    defRebound: 0.15,
    perimeterD: 0.03,
    interiorD: 0.18,
    speed: 0.02,
    strength: 0.13,
    stamina: 0.04,
  },
};

export function clampRating(value: number): number {
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(value)));
}

/** A player's overall rating: the position-weighted average of their attributes. */
export function computeOverall(position: Position, ratings: Ratings): number {
  const weights = OVERALL_WEIGHTS[position];
  let total = 0;
  for (const key of RATING_KEYS) {
    total += weights[key] * ratings[key];
  }
  return clampRating(total);
}

/** Display helper: 6 → "6'0\"", 79 → "6'7\"". */
export function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
