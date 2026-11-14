import { maxSalary, minSalary } from "./finance";

/**
 * Computer teams re-signing their own players (docs/DESIGN.md, "Computer
 * teams re-sign players"): before a season's contracts run out, a computer
 * team decides which expiring players it wants to keep and what to pay them.
 * Pure: the player's own side of it (what he asks, the least he will sign
 * for) is worked out by the caller with the rules in extensions.ts.
 */

/** A team keeps this many of its best players, whatever their age. */
export const KEEP_BEST = 8;

/** A young player with room to grow is kept a little further down the roster. */
export const KEEP_YOUNG_DEPTH = 11;

/** What a team pays at most, as a share of what the player asks. */
export const MOST_OVER_ASK = 1.2;

export type ExpiringPlayer = {
  id: string;
  age: number;
  overall: number;
  potential: number;
  /** His contract's last season is this one. */
  salary: number;
  /** 1 is the team's best player by value. */
  rank: number;
  ask: number;
  askYears: number;
  /** The longest contract his age allows. */
  maxYears: number;
  /** The least he signs for (Infinity if he never would). */
  minimum: number;
};

export type Offer = { id: string; salary: number; years: number };

/** Whether the team wants him back at all. */
export function wantsBack(p: ExpiringPlayer): boolean {
  if (p.age >= 35) return false;
  if (p.rank <= KEEP_BEST) return p.age < 33 || p.rank <= 5;
  return (
    p.rank <= KEEP_YOUNG_DEPTH && p.age <= 23 && p.potential - p.overall >= 8
  );
}

/**
 * The offer for one player, or null: the team wants him, he would sign for a
 * price it will pay, and a contract that runs longer than his old one exists.
 */
export function resignOffer(p: ExpiringPlayer, cap: number): Offer | null {
  if (!wantsBack(p)) return null;
  // At least two years: an extension has to end after the contract it replaces.
  if (p.maxYears < 2) return null;
  const least = Math.min(maxSalary(cap), Math.max(minSalary(cap), p.minimum));
  if (!Number.isFinite(p.minimum)) return null;
  // He thinks too little of the team for the price to be worth it.
  if (least > p.ask * MOST_OVER_ASK) return null;
  return {
    id: p.id,
    salary: least,
    years: Math.max(2, Math.min(p.askYears, p.maxYears)),
  };
}

/**
 * A team's re-signings, best players first, each only if the payroll stays
 * within `limit` (a new contract replaces the old salary).
 */
export function resignTeam(
  players: readonly ExpiringPlayer[],
  payroll: number,
  limit: number,
  cap: number,
): Offer[] {
  const offers: Offer[] = [];
  let total = payroll;
  for (const p of [...players].sort((a, b) => a.rank - b.rank)) {
    const offer = resignOffer(p, cap);
    if (!offer) continue;
    const after = total - p.salary + offer.salary;
    // Paying a little more is fine; going past the limit is not.
    if (after > limit && offer.salary > p.salary) continue;
    total = after;
    offers.push(offer);
  }
  return offers;
}
