import { describe, expect, it } from "vitest";
import {
  addDays,
  campAgeFactor,
  campGainMean,
  campPlaces,
  daysBetween,
  draftNoise,
  openingDay,
  playoffDate,
  regularSeasonDate,
  seasonDate,
  staffSalary,
  stageDates,
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
});

describe("the season's dates", () => {
  it("opens on October 20 and ends the regular season on April 12", () => {
    expect(regularSeasonDate(2026, 1, 85)).toBe("2026-10-20");
    expect(regularSeasonDate(2026, 85, 85)).toBe("2027-04-12");
    expect(openingDay(2030)).toBe("2030-10-20");
  });

  it("never runs two game days into one date, and only moves forward", () => {
    for (const lastDay of [20, 43, 76, 85, 120]) {
      let previous = "";
      for (let day = 1; day <= lastDay; day++) {
        const date = regularSeasonDate(2026, day, lastDay);
        if (lastDay <= 174) expect(date > previous).toBe(true);
        previous = date;
      }
    }
  });

  it("plays the playoffs every other day from April 18, ending in June", () => {
    expect(playoffDate(2026, 1)).toBe("2027-04-18");
    expect(playoffDate(2026, 2)).toBe("2027-04-20");
    expect(playoffDate(2026, 28) <= "2027-06-17").toBe(true);
  });

  it("is the same every year", () => {
    const stage = (year: number) =>
      stageDates("training-camp", year).start.slice(5);
    expect(stage(2026)).toBe(stage(2031));
  });

  it("gives every offseason stage dates that follow each other to opening night", () => {
    const d = (s: "draft" | "free-agency" | "training-camp" | "preseason") =>
      stageDates(s, 2027);
    expect(d("draft")).toEqual({ start: "2027-06-25", end: "2027-06-25" });
    expect(d("free-agency")).toEqual({
      start: "2027-07-01",
      end: "2027-09-23",
    });
    expect(d("training-camp")).toEqual({
      start: "2027-09-24",
      end: "2027-10-06",
    });
    expect(d("preseason")).toEqual({ start: "2027-10-07", end: "2027-10-19" });
    expect(addDays(d("preseason").end, 1)).toBe(openingDay(2027));
  });

  it("dates a season by its phase", () => {
    const base = { year: 2026, stage: null, lastDay: 85 } as const;
    expect(seasonDate({ ...base, phase: "regular-season", day: 1 })).toBe(
      "2026-10-20",
    );
    expect(seasonDate({ ...base, phase: "playoffs", day: 86 })).toBe(
      "2027-04-18",
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
    ).toBe("2027-10-07");
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

  it("gives a better scout a clearer board", () => {
    expect(draftNoise(null)).toBe(2);
    expect(draftNoise(30)).toBe(2);
    expect(draftNoise(95)).toBeLessThan(0.6);
    expect(draftNoise(80)).toBeLessThan(draftNoise(50));
  });
});
