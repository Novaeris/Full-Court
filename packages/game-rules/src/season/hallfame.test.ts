import { describe, expect, it } from "vitest";
import {
  ALL_STAR_POINTS,
  INDUCTION_SCORE,
  TITLE_POINTS,
  WAIT_SEASONS,
  careerScore,
  inductionYear,
  isInducted,
  type Career,
} from "./hallfame";

const career = (over: Partial<Career> = {}): Career => ({
  seasons: [],
  honors: {},
  allStars: 0,
  titles: 0,
  ...over,
});

const seasons = (n: number, efficiency: number, games = 82) =>
  Array.from({ length: n }, () => ({ games, efficiency }));

describe("careerScore", () => {
  it("is nothing for an ordinary career", () => {
    expect(careerScore(career())).toBe(0);
    expect(careerScore(career({ seasons: seasons(12, 10) }))).toBe(0);
    expect(careerScore(career({ seasons: seasons(12, 6) }))).toBe(0);
  });

  it("counts production above an ordinary player, by games played", () => {
    expect(careerScore(career({ seasons: seasons(1, 20) }))).toBe(10);
    expect(careerScore(career({ seasons: seasons(1, 20, 41) }))).toBe(5);
  });

  it("adds points for honours, All-Star Games and championships", () => {
    const score = careerScore(
      career({
        honors: { mvp: 2, "all-league-1": 1, "unknown-award": 9 },
        allStars: 3,
        titles: 2,
      }),
    );
    expect(score).toBe(2 * 12 + 6 + 3 * ALL_STAR_POINTS + 2 * TITLE_POINTS);
  });

  it("is higher for a better career, whatever else is the same", () => {
    const base = career({ seasons: seasons(8, 18), allStars: 3 });
    expect(careerScore({ ...base, honors: { mvp: 1 } })).toBeGreaterThan(
      careerScore(base),
    );
    expect(careerScore({ ...base, seasons: seasons(10, 18) })).toBeGreaterThan(
      careerScore(base),
    );
  });
});

describe("who is inducted", () => {
  it("needs a high enough score", () => {
    expect(isInducted(INDUCTION_SCORE - 0.1, 2030, 2040)).toBe(false);
    expect(isInducted(INDUCTION_SCORE, 2030, 2040)).toBe(true);
  });

  it("waits for the seasons after retirement to pass", () => {
    expect(inductionYear(2030)).toBe(2030 + WAIT_SEASONS);
    expect(isInducted(100, 2030, 2030 + WAIT_SEASONS - 1)).toBe(false);
    expect(isInducted(100, 2030, 2030 + WAIT_SEASONS)).toBe(true);
  });

  it("puts a long great career in, and a long good one out", () => {
    const great = careerScore(
      career({
        seasons: seasons(12, 24),
        honors: { mvp: 1, "all-league-1": 3, "all-league-2": 2 },
        allStars: 7,
        titles: 1,
      }),
    );
    const good = careerScore(
      career({ seasons: seasons(10, 15), honors: { "all-league-3": 1 } }),
    );
    expect(great).toBeGreaterThanOrEqual(INDUCTION_SCORE);
    expect(good).toBeLessThan(INDUCTION_SCORE);
  });
});
