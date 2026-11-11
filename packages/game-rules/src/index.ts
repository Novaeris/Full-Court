import { POSITIONS, type Position } from "@fullcourt/game-types";

/** Roster size limits. Placeholder values until the league rules are designed. */
export const ROSTER_LIMITS = { min: 13, max: 15 } as const;

export function isLegalRosterSize(size: number): boolean {
  return (
    Number.isInteger(size) &&
    size >= ROSTER_LIMITS.min &&
    size <= ROSTER_LIMITS.max
  );
}

/** Positions with nobody on the roster. */
export function missingPositions(roster: readonly Position[]): Position[] {
  return POSITIONS.filter((position) => !roster.includes(position));
}
