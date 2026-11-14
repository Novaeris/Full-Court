/**
 * Coaching (docs/DESIGN.md, "Coaching and rotations"): what a head coach adds
 * to a team, and how many players an owner can ask the coach to use.
 */

/** The most a head coach adds to, or takes from, every rating of every player. */
export const COACH_BONUS_MAX = 2;
export const COACH_BONUS_MIN = -1.7;

/**
 * Rating points a head coach adds to every player's effective ratings in a
 * game: nothing for a rating of 60, +2 for the best coaches (95) and -1.7 for
 * the worst (30). A team without a head coach gets nothing.
 */
export function coachingBonus(rating: number | null | undefined): number {
  if (rating === null || rating === undefined) return 0;
  const raw = ((rating - 60) / 35) * COACH_BONUS_MAX;
  const bounded = Math.min(COACH_BONUS_MAX, Math.max(COACH_BONUS_MIN, raw));
  return Math.round(bounded * 100) / 100;
}

/** How many players the coach may use in a game (the starters count). */
export const ROTATION_SIZES = [7, 8, 9, 10, 11, 12] as const;
export type RotationSize = (typeof ROTATION_SIZES)[number];

export function isRotationSize(n: number): n is RotationSize {
  return (ROTATION_SIZES as readonly number[]).includes(n);
}

/** What each rotation size means, for the pages. */
export const ROTATION_NOTES: Readonly<Record<RotationSize, string>> = {
  7: "Seven players: the starters play heavy minutes and tire.",
  8: "Eight players: a short bench.",
  9: "Nine players.",
  10: "Ten players.",
  11: "Eleven players: a deep bench, starters rest more.",
  12: "Twelve players: nearly everyone plays.",
};
