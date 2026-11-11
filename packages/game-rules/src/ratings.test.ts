import { POSITIONS, RATING_KEYS, type Ratings } from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import {
  OVERALL_WEIGHTS,
  clampRating,
  computeOverall,
  formatHeight,
} from "./ratings";

const flat = (value: number) =>
  Object.fromEntries(RATING_KEYS.map((k) => [k, value])) as Ratings;

describe("overall rating", () => {
  it("weights sum to 1 for every position", () => {
    for (const position of POSITIONS) {
      const sum = Object.values(OVERALL_WEIGHTS[position]).reduce(
        (a, b) => a + b,
        0,
      );
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("equals the attribute value when every attribute is the same", () => {
    for (const position of POSITIONS) {
      expect(computeOverall(position, flat(70))).toBe(70);
    }
  });

  it("rewards the skills a position needs", () => {
    const shooter = { ...flat(50), threePoint: 95, midRange: 90 };
    const bigMan = { ...flat(50), inside: 95, interiorD: 90 };
    expect(computeOverall("SG", shooter)).toBeGreaterThan(
      computeOverall("C", shooter),
    );
    expect(computeOverall("C", bigMan)).toBeGreaterThan(
      computeOverall("SG", bigMan),
    );
  });

  it("clamps to the 25–99 scale", () => {
    expect(clampRating(10)).toBe(25);
    expect(clampRating(120)).toBe(99);
    expect(clampRating(66.6)).toBe(67);
  });

  it("formats heights", () => {
    expect(formatHeight(72)).toBe("6'0\"");
    expect(formatHeight(83)).toBe("6'11\"");
  });
});
