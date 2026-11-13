/**
 * The offseason's rules that need no randomness: how players are expected to
 * change with age, who is likely to retire, and how teams value prospects.
 * The engine adds the dice (packages/game-engine/src/offseason).
 */

/** Rounds in the draft. Every team has one pick in each round. */
export const DRAFT_ROUNDS = 2;

/** The worst teams that missed the playoffs draw for the first picks. */
export const LOTTERY_PICKS = 4;

/**
 * The lottery's weight for each team that missed the playoffs, worst record
 * first. The three worst teams share the best odds; each better team has
 * fewer. `lotteryOdds` turns these into the chance of the first pick.
 */
export function lotteryWeights(teams: number): number[] {
  return Array.from(
    { length: teams },
    (_, i) => (teams - Math.max(0, i - 2)) ** 2,
  );
}

/** Each lottery team's chance of the first pick, worst record first. They sum to 1. */
export function lotteryOdds(teams: number): number[] {
  const weights = lotteryWeights(teams);
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => w / total);
}

/** Extra prospects beyond the picks, who go undrafted into free agency. */
export const UNDRAFTED_PROSPECTS = 8;

/** The league's oldest possible player: everyone retires by this age. */
export const MAX_PLAYER_AGE = 40;

/** Expected change in overall rating over one offseason, by the age reached before it. */
const AGE_CURVE: Readonly<Record<number, number>> = {
  18: 5,
  19: 4.5,
  20: 4,
  21: 3.2,
  22: 2.5,
  23: 1.8,
  24: 1.2,
  25: 0.6,
  26: 0.2,
  27: 0,
  28: -0.2,
  29: -0.6,
  30: -1,
  31: -1.5,
  32: -2,
  33: -2.5,
};

export function expectedChange(age: number): number {
  if (age < 18) return 5;
  if (age > 33) return -3;
  return AGE_CURVE[age] as number;
}

/**
 * The chance a player retires this offseason. Nobody retires young, the chance
 * climbs steeply after 33, and a player who finds no team retires within a
 * few years (sooner if he is older or weak). Free agency itself has no cap.
 */
export function retirementChance(
  age: number,
  overall: number,
  hasTeam: boolean,
): number {
  if (age >= MAX_PLAYER_AGE) return 1;
  let chance = 0;
  if (age >= 34) chance = Math.min(1, 0.08 + (age - 34) * 0.15);
  else if (age >= 31 && overall < 48) chance = 0.1;
  if (overall < 50 && age >= 34) chance += 0.15;
  // A player without a team gives up in time, sooner if he is older or weak.
  if (!hasTeam) chance += 0.2 + (age >= 28 || overall < 45 ? 0.25 : 0);
  return Math.min(1, chance);
}

/** How highly a team values a player when drafting or signing: now and later. */
export function playerValue(
  overall: number,
  potential: number,
  age: number,
): number {
  const youth = age <= 22 ? 0.45 : age <= 25 ? 0.3 : 0.15;
  return overall * (1 - youth) + potential * youth;
}
