/**
 * Player development during the season (docs/DESIGN.md, "Development during
 * the season"): the changes a player's ratings go through in a year are not
 * all left to the offseason. A share of the year's expected change happens in
 * the season, in a few steps, to every player alike. Pure.
 */

/**
 * The share of a year's expected change that happens during the season; the
 * offseason applies the rest, so a player's year is the same size as before.
 */
export const IN_SEASON_SHARE = 0.3;

/** How many steps the season's share is split into. */
export const DEVELOPMENT_STEPS = 2;

/** The season day before which a step happens (1-based): a third and two thirds of the way. */
export function developmentDay(step: number, lastDay: number): number {
  return Math.max(2, Math.floor((step * lastDay) / (DEVELOPMENT_STEPS + 1)));
}

/** Which step, if any, happens before this day. */
export function developmentStepOn(day: number, lastDay: number): number | null {
  for (let step = 1; step <= DEVELOPMENT_STEPS; step++) {
    if (developmentDay(step, lastDay) === day) return step;
  }
  return null;
}
