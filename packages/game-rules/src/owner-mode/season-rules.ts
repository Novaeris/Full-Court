import {
  SCHEDULE_PRESET_TIERS,
  type LeagueStructure,
  type PlayoffConfig,
  type ScheduleRule,
  type ScheduleTiers,
} from "@fullcourt/game-types";
import { seasonLength, validateScheduleTiers } from "../season/schedule";
import { validatePlayoffConfig } from "./playoffs";
import type { RuleIssue } from "./structure";

/**
 * The rules for a league's seasons (docs/DESIGN.md, "Season rules"): how the
 * regular season is scheduled and how the playoffs are played. They can be
 * changed for the next season; the current one keeps the rules it began with.
 * Pure.
 */

/** The schedule a league uses unless it has chosen another. */
export const STANDARD_SCHEDULE: ScheduleRule = {
  preset: "standard",
  tiers: SCHEDULE_PRESET_TIERS.standard,
};

/** A schedule rule for a preset; `custom` takes the tiers it is given. */
export function scheduleFor(
  preset: ScheduleRule["preset"],
  custom?: ScheduleTiers,
): ScheduleRule {
  if (preset === "custom") {
    return { preset, tiers: custom ?? SCHEDULE_PRESET_TIERS.standard };
  }
  return { preset, tiers: SCHEDULE_PRESET_TIERS[preset] };
}

/** Games each team plays under a schedule, or null if the league can't be scheduled evenly. */
export function scheduleGames(
  structure: LeagueStructure,
  schedule: ScheduleRule,
): number | null {
  return seasonLength(structure, schedule.tiers);
}

const sameTiers = (a: ScheduleTiers, b: ScheduleTiers) =>
  a.division === b.division &&
  a.conference === b.conference &&
  a.interconference === b.interconference;

export function sameSchedule(a: ScheduleRule, b: ScheduleRule): boolean {
  return a.preset === b.preset && sameTiers(a.tiers, b.tiers);
}

export function samePlayoffs(a: PlayoffConfig, b: PlayoffConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What is wrong with a set of season rules for a league, if anything: a named
 * preset must carry its own tiers, every team must play the same number of
 * games, and the playoff format must fit the league.
 */
export function seasonRulesIssues(
  structure: LeagueStructure,
  schedule: ScheduleRule,
  playoffs: PlayoffConfig,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (
    schedule.preset !== "custom" &&
    !sameTiers(schedule.tiers, SCHEDULE_PRESET_TIERS[schedule.preset])
  ) {
    issues.push({
      code: "preset_tiers_mismatch",
      message: `The ${schedule.preset} schedule has its own game counts; choose custom to set them.`,
    });
  }
  issues.push(...validateScheduleTiers(structure, schedule.tiers));
  issues.push(...validatePlayoffConfig(structure, playoffs));
  return issues;
}
