import { POSITIONS, type Position } from "@fullcourt/game-types";

/** Roster size limits: a team may carry anywhere from 12 to 15 players. */
export const ROSTER_LIMITS = { min: 12, max: 15 } as const;

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

export {
  OVERALL_WEIGHTS,
  clampRating,
  computeOverall,
  formatHeight,
} from "./ratings";

export * from "./owner-mode/structure";
export * from "./owner-mode/playoffs";
export * from "./owner-mode/franchises";
export * from "./owner-mode/setup";
export * from "./season/bracket";
export * from "./season/court";
export * from "./season/schedule";
export * from "./season/standings";
export * from "./season/offseason";
export * from "./season/calendar";
export * from "./season/camp";
export * from "./season/finance";
export * from "./season/preferences";
export * from "./season/trade";
export * from "./season/awards";
export * from "./season/coaching";
export * from "./season/stats";
export * from "./season/extensions";
export * from "./season/allstar";
export * from "./season/styles";
export * from "./season/recap";
export * from "./season/outlook";
export * from "./season/power";
