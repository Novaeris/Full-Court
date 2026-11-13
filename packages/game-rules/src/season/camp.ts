import {
  CAMP_PROGRAMS,
  STAFF_ROLES,
  type CampProgram,
  type RatingKey,
  type StaffRole,
} from "@fullcourt/game-types";

/**
 * Training camp and staff rules that need no randomness
 * (docs/DESIGN.md, "Training camp" and "Staff"). The engine adds the dice.
 */

// Camp ---------------------------------------------------------------------------------------------------

export { CAMP_PROGRAMS, type CampProgram };

export const CAMP_PROGRAM_INFO: Record<
  CampProgram,
  { label: string; ratings: readonly RatingKey[] }
> = {
  shooting: {
    label: "Shooting",
    ratings: ["midRange", "threePoint", "freeThrow"],
  },
  inside: {
    label: "Inside game",
    ratings: ["inside", "offRebound", "defRebound"],
  },
  playmaking: { label: "Playmaking", ratings: ["passing", "ballHandling"] },
  "perimeter-defense": { label: "Perimeter defense", ratings: ["perimeterD"] },
  "interior-defense": { label: "Interior defense", ratings: ["interiorD"] },
  athleticism: {
    label: "Athleticism",
    ratings: ["speed", "strength", "stamina"],
  },
};

/** Places in camp: 3, plus 1 for a head coach rated 60 or more, 2 for 80 or more. */
export function campPlaces(headCoachRating: number | null): number {
  if (headCoachRating === null) return 3;
  return 3 + (headCoachRating >= 80 ? 2 : headCoachRating >= 60 ? 1 : 0);
}

/** How much younger players gain from camp. */
export function campAgeFactor(age: number): number {
  if (age <= 22) return 1.4;
  if (age <= 27) return 1;
  if (age <= 30) return 0.6;
  return 0.3;
}

/**
 * The average gain in each rating of a program: about 1.5, plus up to 2.5 for
 * the coach who runs it (the conditioning coach for athleticism, the
 * development coach for everything else) at the top of the scale, scaled by
 * age. A team without that coach gets the base only.
 */
export function campGainMean(age: number, coachRating: number | null): number {
  const bonus =
    coachRating === null ? 0 : (Math.max(coachRating - 30, 0) / 65) * 2.5;
  return (1.5 + bonus) * campAgeFactor(age);
}

// Staff --------------------------------------------------------------------------------------------------

export { STAFF_ROLES, type StaffRole };

export const STAFF_ROLE_INFO: Record<
  StaffRole,
  { label: string; effect: string }
> = {
  "head-coach": {
    label: "Head coach",
    effect: "More places in training camp",
  },
  "development-coach": {
    label: "Development coach",
    effect: "Bigger gains at camp",
  },
  "conditioning-coach": {
    label: "Conditioning coach",
    effect: "Bigger athleticism gains at camp",
  },
  scout: { label: "Scout", effect: "A clearer draft board" },
};

export const STAFF_RATING_MIN = 30;
export const STAFF_RATING_MAX = 95;

/** What a team may spend on staff in a year in a league's first season, in thousands of dollars. */
export const STAFF_BUDGET = 10_000;

/**
 * What a team may spend on staff in a year when the salary cap is `cap`: 8% of
 * it. Staff are paid from this budget, apart from the player payroll, so staff
 * salaries never count against the cap or the hard ceiling.
 */
export function staffBudget(cap: number): number {
  return Math.round(cap * 0.08);
}

/** Staff retire at this age. */
export const STAFF_RETIREMENT_AGE = 65;

/** Contracts run one to three years. */
export const STAFF_CONTRACT_YEARS = { min: 1, max: 3 } as const;

/** A year's salary in thousands of dollars: $250,000 at 30, about $3.5 million at 95. */
export function staffSalary(rating: number): number {
  const t = (Math.min(Math.max(rating, 30), 95) - 30) / 65;
  return Math.round((250 + 3250 * t * t) / 10) * 10;
}

/**
 * How much noise a team's draft board has: 2 rating points with the weakest
 * scout (or none), under 0.6 with the best.
 */
export function draftNoise(scoutRating: number | null): number {
  if (scoutRating === null) return 2;
  return 2 - (Math.max(scoutRating - 30, 0) / 65) * 1.45;
}
