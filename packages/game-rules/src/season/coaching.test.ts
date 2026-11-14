import { describe, expect, it } from "vitest";
import {
  COACH_BONUS_MAX,
  COACH_BONUS_MIN,
  ROTATION_SIZES,
  coachingBonus,
  isRotationSize,
} from "./coaching";

describe("coachingBonus", () => {
  it("is nothing for an average coach or no coach", () => {
    expect(coachingBonus(60)).toBe(0);
    expect(coachingBonus(null)).toBe(0);
    expect(coachingBonus(undefined)).toBe(0);
  });

  it("rises with the rating, to the most for the best coaches", () => {
    expect(coachingBonus(95)).toBe(COACH_BONUS_MAX);
    expect(coachingBonus(77.5)).toBe(1);
    expect(coachingBonus(80)).toBeGreaterThan(coachingBonus(70));
  });

  it("falls below zero for a poor coach, and is bounded", () => {
    expect(coachingBonus(30)).toBe(COACH_BONUS_MIN);
    expect(coachingBonus(45)).toBeLessThan(0);
    expect(coachingBonus(0)).toBe(COACH_BONUS_MIN);
    expect(coachingBonus(200)).toBe(COACH_BONUS_MAX);
  });
});

describe("rotation sizes", () => {
  it("are 7 to 12 players", () => {
    expect([...ROTATION_SIZES]).toEqual([7, 8, 9, 10, 11, 12]);
    expect(isRotationSize(9)).toBe(true);
    expect(isRotationSize(6)).toBe(false);
    expect(isRotationSize(13)).toBe(false);
  });
});
