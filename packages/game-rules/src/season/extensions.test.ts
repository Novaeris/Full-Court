import { describe, expect, it } from "vitest";
import {
  EXTENSION_ACCEPTS_AT,
  extensionAccepts,
  extensionFactor,
  extensionMood,
  extensionWorth,
  minimumExtension,
} from "./extensions";
import type { Appeal, Priorities } from "./preferences";

const money: Priorities = {
  money: 1,
  winning: 0,
  role: 0,
  market: 0,
  history: 0,
};
const winner: Priorities = {
  money: 0.1,
  winning: 0.9,
  role: 0,
  market: 0,
  history: 0,
};
const appeal = (over: Partial<Appeal> = {}): Appeal => ({
  winning: 0.5,
  role: 0.5,
  market: 0.5,
  history: 0.5,
  ...over,
});

describe("extensions", () => {
  it("a player who cares only about money signs at his ask, whatever the team", () => {
    expect(extensionFactor(money, appeal({ winning: 0 }))).toBe(1);
    expect(extensionWorth(5_000, 5_000, money, appeal())).toBe(1);
    expect(
      extensionAccepts(extensionWorth(5_000, 5_000, money, appeal())),
    ).toBe(true);
    expect(
      extensionAccepts(extensionWorth(4_900, 5_000, money, appeal())),
    ).toBe(false);
  });

  it("a winning team lets a player who cares about winning sign for less", () => {
    const good = minimumExtension(10_000, winner, appeal({ winning: 1 }));
    const average = minimumExtension(10_000, winner, appeal());
    const bad = minimumExtension(10_000, winner, appeal({ winning: 0 }));
    expect(good).toBeLessThan(average);
    expect(average).toBe(10_000);
    expect(bad).toBeGreaterThan(average);
  });

  it("the minimum is exactly where he starts to sign, in steps of 10", () => {
    const a = appeal({ winning: 0.9 });
    const min = minimumExtension(8_765, winner, a);
    expect(min % 10).toBe(0);
    expect(extensionAccepts(extensionWorth(min, 8_765, winner, a))).toBe(true);
    expect(extensionAccepts(extensionWorth(min - 10, 8_765, winner, a))).toBe(
      false,
    );
    expect(EXTENSION_ACCEPTS_AT).toBe(1);
  });

  it("describes how he feels", () => {
    expect(extensionMood(1.15)).toBe("eager");
    expect(extensionMood(1)).toBe("willing");
    expect(extensionMood(0.9)).toBe("reluctant");
    expect(extensionMood(extensionFactor(winner, appeal({ winning: 1 })))).toBe(
      "eager",
    );
    expect(extensionMood(extensionFactor(winner, appeal({ winning: 0 })))).toBe(
      "reluctant",
    );
  });

  it("worth is zero without an ask", () => {
    expect(extensionWorth(5_000, 0, money, appeal())).toBe(0);
  });
});
