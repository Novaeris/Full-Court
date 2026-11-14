import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_STEPS,
  developmentDay,
  developmentStepOn,
} from "./development";

describe("when the steps happen", () => {
  it("spreads them through the season, one after another", () => {
    expect(developmentDay(1, 90)).toBe(30);
    expect(developmentDay(2, 90)).toBe(60);
  });

  it("finds the step for a day, and none for any other", () => {
    expect(developmentStepOn(30, 90)).toBe(1);
    expect(developmentStepOn(60, 90)).toBe(2);
    expect(developmentStepOn(31, 90)).toBeNull();
    expect(developmentStepOn(1, 90)).toBeNull();
  });

  it("gives every step its own day, even in a short season", () => {
    for (const last of [6, 7, 14, 31, 90, 164]) {
      const days = Array.from({ length: DEVELOPMENT_STEPS }, (_, i) =>
        developmentDay(i + 1, last),
      );
      expect(new Set(days).size, `season of ${last}`).toBe(DEVELOPMENT_STEPS);
      for (const d of days) expect(d).toBeLessThanOrEqual(last);
    }
  });
});
