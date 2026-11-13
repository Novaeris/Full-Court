import { playerValue } from "./offseason";

/**
 * Contracts and the salary cap (docs/DESIGN.md, "Contracts and the cap"). All
 * amounts are in thousands of dollars a year and scale with the cap, which
 * rises each year. Pure rules; the engine adds the dice and the database holds
 * the hard ceiling.
 */

/** The salary cap in a league's first season. */
export const SALARY_CAP_BASE = 125_000;

/** How much the cap rises each year. */
export const SALARY_CAP_GROWTH = 0.03;

/** Payroll can never go above this share of the cap. */
export const HARD_CEILING_SHARE = 1.2;

export const FREE_AGENCY_DAYS = 21;

/** The longest contract. */
export const MAX_CONTRACT_YEARS = 5;

/** The cap `years` seasons after the league's first. */
export function salaryCap(years: number): number {
  return (
    Math.round((SALARY_CAP_BASE * (1 + SALARY_CAP_GROWTH) ** years) / 100) * 100
  );
}

export function hardCeiling(cap: number): number {
  return Math.round(cap * HARD_CEILING_SHARE);
}

/** The least a player can be paid: 0.8% of the cap. */
export function minSalary(cap: number): number {
  return Math.round((cap * 0.008) / 10) * 10;
}

/** The most a player can be paid: 30% of the cap. */
export function maxSalary(cap: number): number {
  return Math.round((cap * 0.3) / 10) * 10;
}

/** The mid-level exception: one free agent a year, for up to 8% of the cap. */
export function midLevelException(cap: number): number {
  return Math.round((cap * 0.08) / 10) * 10;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/**
 * What a free agent asks for a year: from the minimum for the weakest players
 * to the maximum for stars, rising steeply with his value (rating and
 * potential, leaning on potential for the young). Older players ask a little
 * less.
 */
export function askingSalary(
  player: { overall: number; potential: number; age: number },
  cap: number,
): number {
  const value = playerValue(player.overall, player.potential, player.age);
  const t = Math.min(1, Math.max(0, (value - 45) / 40));
  const min = minSalary(cap);
  const max = maxSalary(cap);
  const ageFactor = player.age >= 34 ? 0.8 : player.age >= 32 ? 0.9 : 1;
  return Math.min(
    max,
    Math.max(min, round10((min + (max - min) * t ** 2.8) * ageFactor)),
  );
}

/** The longest contract a player will sign: older players want short deals. */
export function maxYearsFor(age: number): number {
  if (age >= 34) return 2;
  if (age >= 31) return 4;
  return MAX_CONTRACT_YEARS;
}

/** The length of deal a free agent asks for. */
export function askingYears(age: number): number {
  if (age <= 24) return 4;
  if (age <= 29) return 3;
  if (age <= 32) return 2;
  return 1;
}

/**
 * A draft pick's rookie contract: a first-round pick signs for three years at
 * a salary that falls with the pick (the first pick earns 8% of the cap, down
 * to a floor of 1.5%); a second-round pick signs for two years at the minimum.
 */
export function rookieContract(
  pick: number,
  round: number,
  cap: number,
): { salary: number; years: number } {
  if (round > 1) return { salary: minSalary(cap), years: 2 };
  const share = Math.max(0.015, 0.08 * 0.96 ** (pick - 1));
  return {
    salary: Math.max(minSalary(cap), round10(cap * share)),
    years: 3,
  };
}

/** How a signing fits under the rules, or that it doesn't. */
export type SigningRoute = "minimum" | "room" | "rights" | "mle";

/**
 * How a team can sign a player for `salary`, trying the routes that cost it
 * nothing first: the minimum contract, cap room, re-signing its own free agent,
 * then the mid-level exception. Null if none applies. Whatever the route, the
 * payroll can never pass the hard ceiling.
 */
export function signingRoute(input: {
  payroll: number;
  salary: number;
  cap: number;
  /** The player's old team is this team. */
  rights: boolean;
  /** The team has not used its mid-level exception this year. */
  mleAvailable: boolean;
}): SigningRoute | null {
  const { payroll, salary, cap } = input;
  if (salary < minSalary(cap) || salary > maxSalary(cap)) return null;
  if (payroll + salary > hardCeiling(cap)) return null;
  if (salary <= minSalary(cap)) return "minimum";
  if (payroll + salary <= cap) return "room";
  if (input.rights) return "rights";
  if (input.mleAvailable && salary <= midLevelException(cap)) return "mle";
  return null;
}

/**
 * The chance a free agent accepts his best offer on a day, from how it
 * compares with what he asks: under 80% never, 110% or more always, and each
 * passing day makes him a little more willing.
 */
export function acceptChance(ratio: number, day: number): number {
  if (ratio < 0.8) return 0;
  if (ratio >= 1.1) return 1;
  return Math.min(1, (ratio - 0.8) / 0.3 + 0.03 * (day - 1));
}

/** What a team pays an unsigned player after free agency's days are over: 75% of his asking price, at least the minimum. */
export function lateSigningPrice(ask: number, cap: number): number {
  return Math.max(minSalary(cap), round10(ask * 0.75));
}

/** An offer's weight when a player compares offers: his old team's counts 5% extra. */
export function offerScore(salary: number, fromOldTeam: boolean): number {
  return salary * (fromOldTeam ? 1.05 : 1);
}
