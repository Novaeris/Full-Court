import { describe, expect, it } from "vitest";
import {
  bestOfForRound,
  bracketOrder,
  buildFirstRound,
  homeGamePattern,
  nextSlot,
  roundCount,
  roundLabel,
  winsNeeded,
} from "./bracket";

const seeds = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({
    seed: i + 1,
    teamId: `${prefix}${i + 1}`,
    divisionLeader: false,
  }));

describe("bracketOrder", () => {
  it("pairs the best seed with the worst and keeps the top seeds apart", () => {
    expect(bracketOrder(1)).toEqual([1]);
    expect(bracketOrder(2)).toEqual([1, 2]);
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketOrder(16).slice(0, 4)).toEqual([1, 16, 8, 9]);
  });

  it("puts every seed in once, and seeds 1 and 2 in opposite halves", () => {
    for (const n of [2, 4, 8, 16, 32]) {
      const order = bracketOrder(n);
      expect([...order].sort((a, b) => a - b)).toEqual(
        Array.from({ length: n }, (_, i) => i + 1),
      );
      if (n >= 4) {
        const half = order.slice(0, n / 2);
        expect(half.includes(1)).toBe(true);
        expect(half.includes(2)).toBe(false);
      }
    }
  });

  it("refuses a size that isn't a power of two", () => {
    expect(() => bracketOrder(6)).toThrow(/power of two/);
    expect(() => bracketOrder(0)).toThrow();
  });
});

describe("buildFirstRound", () => {
  const standings = [
    "e1",
    "w1",
    "e2",
    "w2",
    "e3",
    "w3",
    "e4",
    "w4",
    "e5",
    "w5",
    "e6",
    "w6",
    "e7",
    "w7",
    "e8",
    "w8",
  ];
  const config = { roundSeriesLengths: [5, 7, 7] as (3 | 5 | 7)[] };

  it("builds one bracket per conference side by side", () => {
    const first = buildFirstRound(
      [
        { conferenceId: "east", seeds: seeds(4, "e") },
        { conferenceId: "west", seeds: seeds(4, "w") },
      ],
      standings,
      config,
    );
    expect(first.map((s) => [s.slot, s.a.teamId, s.b.teamId])).toEqual([
      [0, "e1", "e4"],
      [1, "e2", "e3"],
      [2, "w1", "w4"],
      [3, "w2", "w3"],
    ]);
    expect(first.every((s) => s.round === 1 && s.bestOf === 5)).toBe(true);
  });

  it("records each team's seed and league rank", () => {
    const [series] = buildFirstRound(
      [{ conferenceId: null, seeds: seeds(2, "e") }],
      standings,
      { roundSeriesLengths: [3] },
    );
    expect(series?.a).toEqual({ teamId: "e1", seed: 1, rank: 1 });
    expect(series?.b).toEqual({ teamId: "e2", seed: 2, rank: 3 });
  });

  it("refuses a seed that isn't in the standings", () => {
    expect(() =>
      buildFirstRound(
        [{ conferenceId: null, seeds: seeds(2, "x") }],
        standings,
        config,
      ),
    ).toThrow(/isn't in the standings/);
  });
});

describe("series rules", () => {
  it("needs a majority of games to win", () => {
    expect([3, 5, 7].map((n) => winsNeeded(n as 3 | 5 | 7))).toEqual([2, 3, 4]);
  });

  it("gives home court 2-2-1-1-1, 2-2-1 and 1-1-1", () => {
    const word = (p: boolean[]) => p.map((h) => (h ? "H" : "A")).join("");
    expect(word(homeGamePattern(7))).toBe("HHAAHAH");
    expect(word(homeGamePattern(5))).toBe("HHAAH");
    expect(word(homeGamePattern(3))).toBe("HAH");
  });

  it("moves winners up the tree", () => {
    expect(nextSlot(0)).toEqual({ slot: 0, sibling: 1 });
    expect(nextSlot(1)).toEqual({ slot: 0, sibling: 0 });
    expect(nextSlot(5)).toEqual({ slot: 2, sibling: 4 });
  });

  it("counts rounds and takes each round's length from the setup", () => {
    expect([2, 4, 8, 16].map(roundCount)).toEqual([1, 2, 3, 4]);
    expect(bestOfForRound({ roundSeriesLengths: [3, 5, 7] }, 1)).toBe(3);
    expect(bestOfForRound({ roundSeriesLengths: [3, 5, 7] }, 3)).toBe(7);
    expect(bestOfForRound({ roundSeriesLengths: [5] }, 4)).toBe(5);
  });

  it("names the rounds", () => {
    const names = (rounds: number, seeding: "league" | "conference") =>
      Array.from({ length: rounds }, (_, i) =>
        roundLabel(i + 1, rounds, seeding),
      );
    expect(names(4, "conference")).toEqual([
      "First round",
      "Conference semifinals",
      "Conference finals",
      "Finals",
    ]);
    expect(names(3, "league")).toEqual(["First round", "Semifinals", "Finals"]);
    expect(names(1, "league")).toEqual(["Finals"]);
  });
});
