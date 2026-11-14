import { effectiveSalary, type Appeal, type Priorities } from "./preferences";

/**
 * Contract extensions (docs/DESIGN.md, "Extending a contract"): an owner may
 * give a player of their team a new contract before his old one ends. He
 * decides the way a free agent does, by what the offer is worth to him (the
 * salary, raised or lowered by how he sees the team) against what he asks, but
 * with no luck in it: the owner can see exactly where the line is.
 */

/** A player extends when the offer is worth at least this share of his ask. */
export const EXTENSION_ACCEPTS_AT = 1;

/** Only players with this many years left or fewer can be extended. */
export const EXTENSION_MAX_YEARS_LEFT = 2;

/** Salaries move in steps of this many thousand dollars. */
const STEP = 10;

/** How the player sees the team: what a dollar of salary is worth to him. */
export function extensionFactor(
  priorities: Priorities,
  appeal: Appeal,
): number {
  return effectiveSalary(1, priorities, appeal);
}

/** The offer's worth to him as a share of his ask (1 or more: he signs). */
export function extensionWorth(
  salary: number,
  ask: number,
  priorities: Priorities,
  appeal: Appeal,
): number {
  return ask > 0 ? (salary * extensionFactor(priorities, appeal)) / ask : 0;
}

export function extensionAccepts(worth: number): boolean {
  return worth >= EXTENSION_ACCEPTS_AT;
}

/** The least salary he signs for, in steps of 10: more than his ask if he thinks little of the team. */
export function minimumExtension(
  ask: number,
  priorities: Priorities,
  appeal: Appeal,
): number {
  const factor = extensionFactor(priorities, appeal);
  if (factor <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil((ask * EXTENSION_ACCEPTS_AT) / factor / STEP) * STEP;
}

export type Mood = "eager" | "willing" | "reluctant";

/** How he feels about staying: he'd take less than his ask, about it, or wants more. */
export function extensionMood(factor: number): Mood {
  if (factor >= 1.08) return "eager";
  if (factor >= 0.97) return "willing";
  return "reluctant";
}
