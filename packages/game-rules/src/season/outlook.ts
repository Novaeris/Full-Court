import { hardCeiling, salaryCap } from "./finance";

/**
 * A team's cap outlook (docs/DESIGN.md, "The cap outlook"): what it has
 * committed in each of the next few seasons from the contracts it holds today,
 * against what the cap will be. A contract is a flat salary through the last
 * season it covers, so the commitment in a year is the sum of the salaries
 * that haven't run out by then. Pure.
 */

export type OutlookContract = {
  /** Thousands of dollars a year. */
  salary: number;
  /** The last season it covers. */
  expires: number;
};

export type OutlookYear = {
  year: number;
  cap: number;
  ceiling: number;
  /** Salaries already committed for the season. */
  committed: number;
  /** Players under contract for it. */
  players: number;
  /** The cap less what is committed; negative when over the cap. */
  room: number;
  /** Contracts that end after the season. */
  expiring: number;
};

/** How many seasons the outlook looks ahead, this one included. */
export const OUTLOOK_SEASONS = 5;

/**
 * The outlook from `year`: `seasons` seasons, each with the cap of its own year
 * (it rises every year from the league's first season, `firstYear`).
 */
export function capOutlook(
  contracts: readonly OutlookContract[],
  input: { year: number; firstYear: number; seasons?: number },
): OutlookYear[] {
  const seasons = input.seasons ?? OUTLOOK_SEASONS;
  return Array.from({ length: seasons }, (_, i) => {
    const year = input.year + i;
    const cap = salaryCap(Math.max(0, year - input.firstYear));
    const under = contracts.filter((c) => c.expires >= year);
    const committed = under.reduce((sum, c) => sum + c.salary, 0);
    return {
      year,
      cap,
      ceiling: hardCeiling(cap),
      committed,
      players: under.length,
      room: cap - committed,
      expiring: contracts.filter((c) => c.expires === year).length,
    };
  });
}
