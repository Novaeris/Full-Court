import { describe, expect, it } from "vitest";
import { SALARY_CAP_BASE, hardCeiling, salaryCap } from "./finance";
import { OUTLOOK_SEASONS, capOutlook } from "./outlook";

const contracts = [
  { salary: 20_000, expires: 2026 },
  { salary: 30_000, expires: 2027 },
  { salary: 10_000, expires: 2027 },
  { salary: 40_000, expires: 2029 },
];

describe("capOutlook", () => {
  it("looks five seasons ahead from this one", () => {
    const years = capOutlook(contracts, { year: 2026, firstYear: 2026 });
    expect(years).toHaveLength(OUTLOOK_SEASONS);
    expect(years.map((y) => y.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
  });

  it("commits the salaries that haven't run out, with a flat salary until then", () => {
    const years = capOutlook(contracts, { year: 2026, firstYear: 2026 });
    expect(years.map((y) => y.committed)).toEqual([
      100_000, 80_000, 40_000, 40_000, 0,
    ]);
    expect(years.map((y) => y.players)).toEqual([4, 3, 1, 1, 0]);
  });

  it("counts the contracts that end after each season", () => {
    const years = capOutlook(contracts, { year: 2026, firstYear: 2026 });
    expect(years.map((y) => y.expiring)).toEqual([1, 2, 0, 1, 0]);
  });

  it("measures room against the cap of each year, which rises", () => {
    const years = capOutlook(contracts, { year: 2026, firstYear: 2026 });
    expect(years[0]?.cap).toBe(SALARY_CAP_BASE);
    expect(years[1]?.cap).toBe(salaryCap(1));
    expect(years[1]?.cap).toBeGreaterThan(years[0]?.cap ?? 0);
    for (const y of years) {
      expect(y.room).toBe(y.cap - y.committed);
      expect(y.ceiling).toBe(hardCeiling(y.cap));
    }
  });

  it("counts the cap from the league's first season, not from now", () => {
    const later = capOutlook(contracts, { year: 2030, firstYear: 2026 });
    expect(later[0]?.cap).toBe(salaryCap(4));
  });

  it("is negative room when the payroll is over the cap, and empty for no contracts", () => {
    const heavy = capOutlook([{ salary: 200_000, expires: 2027 }], {
      year: 2026,
      firstYear: 2026,
    });
    expect(heavy[0]?.room).toBeLessThan(0);
    const none = capOutlook([], { year: 2026, firstYear: 2026, seasons: 3 });
    expect(none.map((y) => y.committed)).toEqual([0, 0, 0]);
    expect(none.map((y) => y.room)).toEqual(none.map((y) => y.cap));
  });
});
