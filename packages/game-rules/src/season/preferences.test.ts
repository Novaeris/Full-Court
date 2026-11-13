import { describe, expect, it } from "vitest";
import {
  FA_FACTORS,
  effectiveSalary,
  historyScore,
  marketScore,
  playerPriorities,
  roleLabel,
  roleScore,
  topPriorities,
  winningScore,
} from "../index";

describe("a free agent's priorities", () => {
  it("never change for a player, and add up to 100%", () => {
    expect(playerPriorities("abc")).toEqual(playerPriorities("abc"));
    for (let i = 0; i < 200; i++) {
      const p = playerPriorities(`player-${i}`);
      const total = p.money + FA_FACTORS.reduce((s, f) => s + p[f], 0);
      expect(total).toBeCloseTo(1, 10);
      expect(p.money).toBeGreaterThanOrEqual(0.2);
      expect(p.money).toBeLessThanOrEqual(0.6);
      for (const f of FA_FACTORS) expect(p[f]).toBeGreaterThan(0);
    }
  });

  it("differ from player to player", () => {
    const tops = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tops.add(topPriorities(playerPriorities(`p${i}`), 1)[0] as string);
    }
    expect(tops.size).toBeGreaterThanOrEqual(3);
  });

  it("name the two things he cares about most", () => {
    const p = playerPriorities("x");
    const [first, second] = topPriorities(p);
    expect(p[first as keyof typeof p]).toBeGreaterThanOrEqual(
      p[second as keyof typeof p],
    );
  });
});

describe("what a team offers beyond the salary", () => {
  const neutral = { winning: 0.5, role: 0.5, market: 0.5, history: 0.5 };

  it("makes an average team's offer worth exactly its salary", () => {
    expect(effectiveSalary(10_000, playerPriorities("a"), neutral)).toBeCloseTo(
      10_000,
      6,
    );
  });

  it("makes a winning team's offer worth more to a player who wants to win", () => {
    const winner = { ...neutral, winning: 1 };
    const loser = { ...neutral, winning: 0 };
    let found = false;
    for (let i = 0; i < 100 && !found; i++) {
      const p = playerPriorities(`w${i}`);
      if (p.winning > 0.25) {
        found = true;
        expect(effectiveSalary(10_000, p, winner)).toBeGreaterThan(10_000);
        expect(effectiveSalary(10_000, p, loser)).toBeLessThan(10_000);
      }
    }
    expect(found).toBe(true);
  });

  it("never moves an offer by more than 24%", () => {
    for (let i = 0; i < 200; i++) {
      const p = playerPriorities(`b${i}`);
      const best = { winning: 1, role: 1, market: 1, history: 1 };
      const worst = { winning: 0, role: 0, market: 0, history: 0 };
      expect(effectiveSalary(10_000, p, best)).toBeLessThanOrEqual(12_400);
      expect(effectiveSalary(10_000, p, worst)).toBeGreaterThanOrEqual(7_600);
    }
  });
});

describe("how a team scores", () => {
  it("gives a starting job to a player in a team's best five, the rotation to the next three", () => {
    const roster = [80, 75, 70, 65, 60, 55, 52, 50, 45, 42, 40];
    expect(roleScore(78, roster)).toBe(1);
    expect(roleScore(61, roster)).toBe(1);
    expect(roleScore(56, roster)).toBe(0.6);
    expect(roleScore(51, roster)).toBe(0.6);
    expect(roleScore(41, roster)).toBe(0.2);
    expect(roleLabel(1)).toBe("starter");
    expect(roleLabel(0.6)).toBe("rotation");
    expect(roleLabel(0.2)).toBe("bench");
  });

  it("rates winning from the finish and a playoff run", () => {
    expect(winningScore(1, 12, 4)).toBeGreaterThan(winningScore(1, 12, 0));
    expect(winningScore(1, 12, 0)).toBeGreaterThan(winningScore(12, 12, 0));
    expect(winningScore(12, 12, 0)).toBe(0);
    expect(winningScore(1, 12, 4)).toBeLessThanOrEqual(1);
  });

  it("rates history from titles, finals and playoff seasons", () => {
    const none = { titles: 0, finals: 0, playoffs: 0, missed: 0 };
    expect(historyScore(none)).toBe(0.5);
    const dynasty = { titles: 3, finals: 1, playoffs: 6, missed: 0 };
    const cellar = { titles: 0, finals: 0, playoffs: 0, missed: 8 };
    expect(historyScore(dynasty)).toBeGreaterThan(0.8);
    expect(historyScore(cellar)).toBeLessThan(0.4);
  });

  it("rates a market by its place in the league", () => {
    expect(marketScore(0, 12)).toBe(1);
    expect(marketScore(11, 12)).toBe(0);
    expect(marketScore(5, 12)).toBeGreaterThan(marketScore(6, 12));
  });
});
