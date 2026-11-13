/**
 * The league calendar (docs/DESIGN.md, "The calendar"). Everything hangs on
 * opening night, which is always the second Monday of October; every other
 * date is a whole number of weeks from it, so each year's calendar has the same
 * shape and moves with the weekday. A season is named for the year it starts
 * in: the 2026 season opens in October 2026, and its offseason, draft and
 * training camp fall in 2027. Dates are plain `YYYY-MM-DD` strings; the
 * arithmetic is done here so no platform date API is needed.
 */

import { OFFSEASON_STAGES, type OffseasonStage } from "@fullcourt/game-types";

export { OFFSEASON_STAGES, type OffseasonStage };

export const STAGE_LABELS: Record<OffseasonStage, string> = {
  draft: "Draft",
  "free-agency": "Free agency",
  "training-camp": "Training camp",
  preseason: "Preseason",
};

/**
 * The calendar's rules. Weeks are counted from opening night (a Monday), so a
 * date "N weeks after" opening is also a Monday.
 */
export const CALENDAR = {
  /** Opening night is the second Monday of October. */
  openingMonth: 10,
  openingWeekOfMonth: 2,
  /** The regular season runs this many weeks, ending on a Sunday. */
  regularSeasonWeeks: 26,
  /** The playoffs open on the Saturday after the regular season ends. */
  playoffsStartDaysAfterEnd: 6,
  /** Weeks after the previous opening night that the offseason begins (a Monday). */
  offseasonStartWeeks: 35,
  /** The draft is the Thursday of this week (counted from the previous opening night). */
  draftWeeks: 36,
  draftWeekday: 3,
  /** Free agency opens on the Monday of this week. */
  freeAgencyWeeks: 37,
  /** Training camp starts this many weeks before opening night (two weeks long)... */
  trainingCampWeeksBefore: 4,
  /** ...and the preseason this many (two weeks long). */
  preseasonWeeksBefore: 2,
} as const;

/** Calendar days between playoff game days: the finals end in mid June. */
export const PLAYOFF_DAY_SPACING = 2;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Days counted from 0001-01-01, which was a Monday (the proleptic Gregorian
 * calendar), as day 1. Only differences and the weekday matter.
 */
function toOrdinal(year: number, month: number, day: number): number {
  let days = day;
  for (let m = 1; m < month; m++) days += daysInMonth(year, m);
  const y = year - 1;
  return (
    days +
    y * 365 +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400)
  );
}

function fromOrdinal(ordinal: number): [number, number, number] {
  // Find the year, then the month. The estimate is within a year of the answer.
  let year = Math.floor(ordinal / 365.2425);
  while (toOrdinal(year + 1, 1, 1) <= ordinal) year += 1;
  while (toOrdinal(year, 1, 1) > ordinal) year -= 1;
  let rest = ordinal - toOrdinal(year, 1, 1) + 1;
  let month = 1;
  while (rest > daysInMonth(year, month)) {
    rest -= daysInMonth(year, month);
    month += 1;
  }
  return [year, month, rest];
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function format(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function parts(date: string): [number, number, number] {
  return date.split("-").map(Number) as [number, number, number];
}

/** The date `days` after `date` (a `YYYY-MM-DD` string). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  const [year, month, day] = fromOrdinal(toOrdinal(y, m, d) + days);
  return format(year, month, day);
}

/** Calendar days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return toOrdinal(...parts(to)) - toOrdinal(...parts(from));
}

/** The day of the week: 0 is Monday, 6 is Sunday. */
export function weekday(date: string): number {
  return (toOrdinal(...parts(date)) - 1) % 7;
}

/** The date of the nth (1 = first) given weekday (0 = Monday) of a month. */
export function nthWeekday(
  year: number,
  month: number,
  dayOfWeek: number,
  n: number,
): string {
  const first = format(year, month, 1);
  const offset = (dayOfWeek - weekday(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

/** Opening night of the season of `year`: the second Monday of October. */
export function openingDay(year: number): string {
  return nthWeekday(
    year,
    CALENDAR.openingMonth,
    0,
    CALENDAR.openingWeekOfMonth,
  );
}

/** The last day of the regular season of `year`: a Sunday. */
export function regularSeasonEnd(year: number): string {
  return addDays(openingDay(year), CALENDAR.regularSeasonWeeks * 7 - 1);
}

/**
 * The date of a regular-season game day. The game days are spread evenly from
 * opening night to the end of the regular season, however many there are.
 */
export function regularSeasonDate(
  year: number,
  day: number,
  lastDay: number,
): string {
  const opening = openingDay(year);
  const span = daysBetween(opening, regularSeasonEnd(year));
  const index = Math.min(Math.max(day, 1), lastDay) - 1;
  const offset = lastDay <= 1 ? 0 : Math.floor((index * span) / (lastDay - 1));
  return addDays(opening, offset);
}

/** The date of the nth playoff game day (1 = the first). */
export function playoffDate(year: number, index: number): string {
  return addDays(
    regularSeasonEnd(year),
    CALENDAR.playoffsStartDaysAfterEnd +
      (Math.max(index, 1) - 1) * PLAYOFF_DAY_SPACING,
  );
}

/** When the offseason that follows the season of `year - 1` begins (a Monday). */
export function offseasonStart(year: number): string {
  return addDays(openingDay(year - 1), CALENDAR.offseasonStartWeeks * 7);
}

/** When an offseason stage runs, for the season it leads into (`year`). */
export function stageDates(
  stage: OffseasonStage,
  year: number,
): { start: string; end: string } {
  const previous = openingDay(year - 1);
  const opening = openingDay(year);
  const before = (weeks: number) => addDays(opening, -weeks * 7);
  switch (stage) {
    case "draft": {
      const draft = addDays(
        previous,
        CALENDAR.draftWeeks * 7 + CALENDAR.draftWeekday,
      );
      return { start: draft, end: draft };
    }
    case "free-agency":
      return {
        start: addDays(previous, CALENDAR.freeAgencyWeeks * 7),
        end: addDays(before(CALENDAR.trainingCampWeeksBefore), -1),
      };
    case "training-camp":
      return {
        start: before(CALENDAR.trainingCampWeeksBefore),
        end: addDays(before(CALENDAR.preseasonWeeksBefore), -1),
      };
    case "preseason":
      return {
        start: before(CALENDAR.preseasonWeeksBefore),
        end: addDays(opening, -1),
      };
  }
}

/**
 * The date a season is at. `day` is the season's day counter: the next regular
 * season game day, then (after `lastDay`) one more for each playoff game day.
 */
export function seasonDate(input: {
  year: number;
  phase: "offseason" | "regular-season" | "playoffs" | "complete";
  stage: OffseasonStage | null;
  day: number;
  lastDay: number;
}): string {
  const { year, phase, stage, day, lastDay } = input;
  switch (phase) {
    case "offseason":
      return stageDates(stage ?? "draft", year).start;
    case "regular-season":
      return regularSeasonDate(year, day, lastDay);
    case "playoffs":
      return playoffDate(year, day - lastDay);
    case "complete":
      return playoffDate(year, day - lastDay - 1);
  }
}
