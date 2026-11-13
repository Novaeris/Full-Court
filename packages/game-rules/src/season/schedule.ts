import {
  SCHEDULE_PRESET_TIERS,
  type LeagueStructure,
  type SchedulePreset,
  type ScheduleTiers,
} from "@fullcourt/game-types";
import { totalTeams, type RuleIssue } from "../owner-mode/structure";

/** How two distinct teams relate, which decides how often they meet. */
export type MatchupTier = keyof ScheduleTiers;

export type TeamPlacement = {
  teamId: string;
  conferenceId: string;
  divisionId: string;
};

export function matchupTier(a: TeamPlacement, b: TeamPlacement): MatchupTier {
  if (a.divisionId === b.divisionId) return "division";
  if (a.conferenceId === b.conferenceId) return "conference";
  return "interconference";
}

/** Opponents a team has in each tier, from the structure alone. */
export function opponentCounts(
  structure: LeagueStructure,
  conferenceId: string,
  divisionId: string,
): ScheduleTiers {
  const total = totalTeams(structure);
  let inConference = 0;
  let inDivision = 0;
  for (const conference of structure.conferences) {
    for (const division of conference.divisions) {
      if (conference.id === conferenceId) inConference += division.teamCount;
      if (division.id === divisionId) inDivision = division.teamCount;
    }
  }
  return {
    division: inDivision - 1,
    conference: inConference - inDivision,
    interconference: total - inConference,
  };
}

/** Games a team plays in the regular season, for a team in the given division. */
export function gamesForTeam(
  structure: LeagueStructure,
  tiers: ScheduleTiers,
  conferenceId: string,
  divisionId: string,
): number {
  const o = opponentCounts(structure, conferenceId, divisionId);
  return (
    o.division * tiers.division +
    o.conference * tiers.conference +
    o.interconference * tiers.interconference
  );
}

/**
 * The regular-season length every team plays, or null when teams in different
 * divisions would play different numbers of games. Supported structures have
 * equal divisions, so they always get a number.
 */
export function seasonLength(
  structure: LeagueStructure,
  tiers: ScheduleTiers,
): number | null {
  const lengths = new Set<number>();
  for (const conference of structure.conferences) {
    for (const division of conference.divisions) {
      lengths.add(gamesForTeam(structure, tiers, conference.id, division.id));
    }
  }
  return lengths.size === 1 ? ([...lengths][0] ?? null) : null;
}

/**
 * Tier counts must be whole numbers from 1 to 8, and every team must play the
 * same number of games. Odd tier counts are allowed: the schedule generator
 * (Phase 11) splits those pairs' home games so each team's home and away
 * totals differ by at most one.
 */
export function validateScheduleTiers(
  structure: LeagueStructure,
  tiers: ScheduleTiers,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  for (const key of ["division", "conference", "interconference"] as const) {
    const value = tiers[key];
    if (!Number.isInteger(value) || value < 1 || value > 8) {
      issues.push({
        code: `invalid_${key}_games`,
        message: `Games against each ${key} opponent must be a whole number from 1 to 8.`,
      });
    }
  }
  if (issues.length > 0) return issues;
  if (seasonLength(structure, tiers) === null) {
    issues.push({
      code: "uneven_season",
      message: "Every team must play the same number of games.",
    });
  }
  return issues;
}

/** Regular-season length of each named preset for a structure (null if uneven). */
export function schedulePresetLengths(
  structure: LeagueStructure,
): Record<Exclude<SchedulePreset, "custom">, number | null> {
  return {
    short: seasonLength(structure, SCHEDULE_PRESET_TIERS.short),
    standard: seasonLength(structure, SCHEDULE_PRESET_TIERS.standard),
    long: seasonLength(structure, SCHEDULE_PRESET_TIERS.long),
  };
}
