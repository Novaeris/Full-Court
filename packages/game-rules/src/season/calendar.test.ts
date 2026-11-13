import { describe, expect, it } from "vitest";
import {
  addDays,
  campAgeFactor,
  campGainMean,
  campPlaces,
  daysBetween,
  draftNoise,
  nthWeekday,
  offseasonStart,
  openingDay,
  playoffDate,
  regularSeasonDate,
  regularSeasonEnd,
  seasonDate,
  staffBudget,
  staffSalary,
  stageDates,
  weekday,
} from "../index";

describe("date arithmetic", () => {
  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-10-20", 12)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-10-20", 0)).toBe("2026-10-20");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-20", "2027-04-12")).toBe(174);
    expect(daysBetween("2027-10-20", "2028-04-12")).toBe(175);
    expect(daysBetween("2026-10-20", "2026-10-20")).toBe(0);
  });

  it("is consistent in both directions over many years", () => {
    let date = "2026-01-01";
    for (let i = 0; i < 4000; i++) {
      const next = addDays(date, 1);
      expect(daysBetween(date, next)).toBe(1);
      date = next;
    }
    expect(date).toBe("2036-12-14");
  });

  it("knows the day of the week", () => {
    // 1 = Tuesday ... 0 = Monday, 6 = Sunday.
    expect(weekday("2026-10-12")).toBe(0); // a Monday
    expect(weekday("2026-11-13")).toBe(4); // a Friday
    expect(weekday("2000-01-01")).toBe(5); // a Saturday
    expect(weekday("2028-02-29")).toBe(1); // a Tuesday
  });

  it("finds the nth weekday of a month", () => {
    expect(nthWeekday(2026, 10, 0, 1)).toBe("2026-10-05");
    expect(nthWeekday(2026, 10, 0, 2)).toBe("2026-10-12");
    expect(nthWeekday(2027, 10, 0, 2)).toBe("2027-10-11");
    expect(nthWeekday(2028, 10, 0, 2)).toBe("2028-10-09");
  });
});

describe("the season's dates", () => {
  const years = Array.from({ length: 60 }, (_, i) => 2000 + i);

  it("opens on the second Monday of October, every year", () => {
    for (const year of years) {
      const opening = openingDay(year);
      expect(weekday(opening)).toBe(0);
      expect(opening.slice(0, 8)).toBe(`${year}-10-`);
      const day = Number(opening.slice(8));
      expect(day).toBeGreaterThanOrEqual(8);
      expect(day).toBeLessThanOrEqual(14);
    }
    expect(openingDay(2026)).toBe("2026-10-12");
    expect(openingDay(2027)).toBe("2027-10-11");
  });

  it("runs the regular season 26 weeks, from a Monday to a Sunday", () => {
    for (const year of years) {
      expect(weekday(regularSeasonEnd(year))).toBe(6);
      expect(daysBetween(openingDay(year), regularSeasonEnd(year))).toBe(181);
    }
    expect(regularSeasonEnd(2026)).toBe("2027-04-11");
  });

  it("spreads the game days across those weeks however many there are", () => {
    expect(regularSeasonDate(2026, 1, 85)).toBe(openingDay(2026));
    expect(regularSeasonDate(2026, 85, 85)).toBe(regularSeasonEnd(2026));
    for (const lastDay of [20, 43, 76, 85, 120]) {
      let previous = "";
      for (let day = 1; day <= lastDay; day++) {
        const date = regularSeasonDate(2026, day, lastDay);
        expect(date >= openingDay(2026)).toBe(true);
        expect(date <= regularSeasonEnd(2026)).toBe(true);
        if (lastDay <= 182) expect(date > previous).toBe(true);
        previous = date;
      }
    }
  });

  it("opens the playoffs on the Saturday after, every other day, ending in June", () => {
    for (const year of years) {
      expect(weekday(playoffDate(year, 1))).toBe(5);
      // The longest possible playoffs (four best-of-sevens) end before the offseason.
      expect(playoffDate(year, 28) < offseasonStart(year + 1)).toBe(true);
    }
    expect(playoffDate(2026, 2)).toBe(addDays(playoffDate(2026, 1), 2));
    expect(playoffDate(2026, 28).slice(5, 7)).toBe("06");
  });

  it("puts every offseason stage on a fixed weekday, in order, ending the day before opening night", () => {
    for (const year of years) {
      const d = (s: "draft" | "free-agency" | "training-camp" | "preseason") =>
        stageDates(s, year);
      expect(weekday(offseasonStart(year))).toBe(0);
      expect(weekday(d("draft").start)).toBe(3); // Thursday
      expect(weekday(d("free-agency").start)).toBe(0);
      expect(weekday(d("training-camp").start)).toBe(0);
      expect(weekday(d("preseason").start)).toBe(0);
      expect(weekday(d("preseason").end)).toBe(6);
      expect(offseasonStart(year) < d("draft").start).toBe(true);
      expect(d("draft").end < d("free-agency").start).toBe(true);
      expect(addDays(d("free-agency").end, 1)).toBe(d("training-camp").start);
      expect(addDays(d("training-camp").end, 1)).toBe(d("preseason").start);
      expect(addDays(d("preseason").end, 1)).toBe(openingDay(year));
      // Camp and the preseason are two weeks each.
      expect(
        daysBetween(d("training-camp").start, d("training-camp").end),
      ).toBe(13);
      expect(daysBetween(d("preseason").start, d("preseason").end)).toBe(13);
    }
  });

  it("keeps every offseason about as long as the year does", () => {
    for (const year of years) {
      const free = stageDates("free-agency", year);
      const weeks = daysBetween(free.start, free.end) / 7;
      expect(weeks).toBeGreaterThanOrEqual(9);
      expect(weeks).toBeLessThanOrEqual(12);
    }
  });

  it("gives 2027's offseason these dates", () => {
    expect(stageDates("draft", 2027).start).toBe("2027-06-24");
    expect(stageDates("training-camp", 2027).start).toBe("2027-09-13");
    expect(stageDates("preseason", 2027).start).toBe("2027-09-27");
  });

  it("dates a season by its phase", () => {
    const base = { year: 2026, stage: null, lastDay: 85 } as const;
    expect(seasonDate({ ...base, phase: "regular-season", day: 1 })).toBe(
      "2026-10-12",
    );
    expect(seasonDate({ ...base, phase: "playoffs", day: 86 })).toBe(
      playoffDate(2026, 1),
    );
    expect(seasonDate({ ...base, phase: "complete", day: 90 })).toBe(
      playoffDate(2026, 4),
    );
    expect(
      seasonDate({
        ...base,
        year: 2027,
        phase: "offseason",
        stage: "preseason",
        day: 1,
      }),
    ).toBe(stageDates("preseason", 2027).start);
  });
});

describe("camp and staff rules", () => {
  it("gives a camp 3 to 5 places by head coach", () => {
    expect([
      campPlaces(null),
      campPlaces(59),
      campPlaces(60),
      campPlaces(79),
      campPlaces(80),
    ]).toEqual([3, 3, 4, 4, 5]);
  });

  it("helps the young most and a better coach more", () => {
    expect(campAgeFactor(20)).toBeGreaterThan(campAgeFactor(25));
    expect(campAgeFactor(25)).toBeGreaterThan(campAgeFactor(29));
    expect(campAgeFactor(29)).toBeGreaterThan(campAgeFactor(33));
    expect(campGainMean(20, 95)).toBeGreaterThan(campGainMean(20, 40));
    expect(campGainMean(20, null)).toBeCloseTo(2.1, 5);
  });

  it("charges more for better staff, within the budget's reach", () => {
    expect(staffSalary(30)).toBe(250);
    expect(staffSalary(95)).toBe(3500);
    let previous = 0;
    for (let r = 30; r <= 95; r++) {
      expect(staffSalary(r)).toBeGreaterThanOrEqual(previous);
      previous = staffSalary(r);
    }
    // Four staff at 80 fit in the $10 million budget; four at 95 do not.
    expect(4 * staffSalary(80)).toBeLessThanOrEqual(10_000);
    expect(4 * staffSalary(95)).toBeGreaterThan(10_000);
  });

  it("gives staff a budget of 8% of the cap, apart from the payroll", () => {
    expect(staffBudget(125_000)).toBe(10_000);
    expect(staffBudget(250_000)).toBe(20_000);
  });

  it("gives a better scout a clearer board", () => {
    expect(draftNoise(null)).toBe(2);
    expect(draftNoise(30)).toBe(2);
    expect(draftNoise(95)).toBeLessThan(0.6);
    expect(draftNoise(80)).toBeLessThan(draftNoise(50));
  });
});
