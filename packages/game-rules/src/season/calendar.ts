/**
 * The league calendar: the same dates every year (docs/DESIGN.md, "The
 * calendar"). A season is named for the year it starts in, so the 2026 season
 * runs from October 2026 to June 2027 and its offseason, draft and training
 * camp fall in 2027. Dates are plain `YYYY-MM-DD` strings; the arithmetic is
 * done here so no platform date API is needed.
 */

import { OFFSEASON_STAGES, type OffseasonStage } from "@fullcourt/game-types";

export { OFFSEASON_STAGES, type OffseasonStage };

export const STAGE_LABELS: Record<OffseasonStage, string> = {
  draft: "Draft",
  "free-agency": "Free agency",
  "training-camp": "Training camp",
  preseason: "Preseason",
};

type MonthDay = readonly [month: number, day: number];

/** The fixed dates, as [month, day]. */
export const CALENDAR = {
  opening: [10, 20],
  regularSeasonEnd: [4, 12],
  playoffsStart: [4, 18],
  offseasonStart: [6, 17],
  draft: [6, 25],
  freeAgency: [7, 1],
  trainingCamp: [9, 24],
  preseason: [10, 7],
} as const satisfies Record<string, MonthDay>;

/** Calendar days between playoff game days: the finals end in mid June. */
export const PLAYOFF_DAY_SPACING = 2;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Days since 0000-03-01 style epoch: only differences matter. */
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

/** The date `days` after `date` (a `YYYY-MM-DD` string). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [year, month, day] = fromOrdinal(toOrdinal(y, m, d) + days);
  return format(year, month, day);
}

/** Calendar days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  const f = from.split("-").map(Number) as [number, number, number];
  const t = to.split("-").map(Number) as [number, number, number];
  return toOrdinal(...t) - toOrdinal(...f);
}

const on = (year: number, [month, day]: MonthDay) => format(year, month, day);

/**
 * The date of a regular-season game day. The days are spread evenly from the
 * opening night to the end of the regular season.
 */
export function regularSeasonDate(
  year: number,
  day: number,
  lastDay: number,
): string {
  const opening = on(year, CALENDAR.opening);
  const end = on(year + 1, CALENDAR.regularSeasonEnd);
  const span = daysBetween(opening, end);
  const index = Math.min(Math.max(day, 1), lastDay) - 1;
  const offset = lastDay <= 1 ? 0 : Math.floor((index * span) / (lastDay - 1));
  return addDays(opening, offset);
}

/** The date of the nth playoff game day (1 = the first). */
export function playoffDate(year: number, index: number): string {
  return addDays(
    on(year + 1, CALENDAR.playoffsStart),
    (Math.max(index, 1) - 1) * PLAYOFF_DAY_SPACING,
  );
}

/** When an offseason stage runs, for the season it leads into (`year`). */
export function stageDates(
  stage: OffseasonStage,
  year: number,
): { start: string; end: string } {
  const opening = on(year, CALENDAR.opening);
  switch (stage) {
    case "draft":
      return { start: on(year, CALENDAR.draft), end: on(year, CALENDAR.draft) };
    case "free-agency":
      return {
        start: on(year, CALENDAR.freeAgency),
        end: addDays(on(year, CALENDAR.trainingCamp), -1),
      };
    case "training-camp":
      return {
        start: on(year, CALENDAR.trainingCamp),
        end: addDays(on(year, CALENDAR.preseason), -1),
      };
    case "preseason":
      return { start: on(year, CALENDAR.preseason), end: addDays(opening, -1) };
  }
}

/** When the offseason that leads into the season of `year` begins. */
export function offseasonStart(year: number): string {
  return on(year, CALENDAR.offseasonStart);
}

/** The opening night of the season of `year`. */
export function openingDay(year: number): string {
  return on(year, CALENDAR.opening);
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
