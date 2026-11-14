import { describe, expect, it } from "vitest";
import {
  POWER_MARGIN_CAP,
  POWER_WEIGHTS,
  powerRankings,
  type PowerInput,
} from "./power";

const team = (id: string, over: Partial<PowerInput> = {}): PowerInput => ({
  teamId: id,
  wins: 10,
  losses: 10,
  pointsFor: 2000,
  pointsAgainst: 2000,
  lastTen: "5-5",
  ...over,
});

describe("powerRankings", () => {
  it("weights add up to one", () => {
    const { record, margin, recent } = POWER_WEIGHTS;
    expect(record + margin + recent).toBeCloseTo(1, 10);
  });

  it("ranks the better team first and numbers them from 1", () => {
    const rows = powerRankings([
      team("weak", {
        wins: 4,
        losses: 16,
        pointsFor: 1900,
        pointsAgainst: 2150,
        lastTen: "2-8",
      }),
      team("best", {
        wins: 17,
        losses: 3,
        pointsFor: 2300,
        pointsAgainst: 1950,
        lastTen: "9-1",
      }),
      team("mid"),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(["best", "mid", "weak"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0]!.score).toBeGreaterThan(rows[1]!.score);
    for (const r of rows) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("is not just the standings: a hot team with a big margin can outrank a better record", () => {
    const rows = powerRankings([
      team("record", {
        wins: 12,
        losses: 8,
        pointsFor: 2000,
        pointsAgainst: 1990,
        lastTen: "4-6",
      }),
      team("form", {
        wins: 11,
        losses: 9,
        pointsFor: 2300,
        pointsAgainst: 1950,
        lastTen: "9-1",
      }),
    ]);
    expect(rows[0]!.teamId).toBe("form");
    // ...though it has the worse record.
    expect(rows[0]!.winPct).toBeLessThan(rows[1]!.winPct);
  });

  it("reports the margin a game and the recent form", () => {
    const [r] = powerRankings([
      team("a", {
        wins: 15,
        losses: 5,
        pointsFor: 2300,
        pointsAgainst: 2000,
        lastTen: "7-3",
      }),
    ]);
    expect(r).toMatchObject({ margin: 15, winPct: 0.75, recent: 0.7 });
  });

  it("caps the margin: no team scores more than the best", () => {
    const [huge, big] = powerRankings([
      team("huge", { pointsFor: 5000, pointsAgainst: 1000 }),
      team("big", {
        pointsFor: 2000 + POWER_MARGIN_CAP * 20,
        pointsAgainst: 2000,
      }),
    ]);
    expect(huge!.score).toBe(big!.score);
  });

  it("treats a team with no games as middling", () => {
    const [r] = powerRankings([
      team("new", {
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        lastTen: "0-0",
      }),
    ]);
    expect(r!.score).toBe(50);
    expect(r!.winPct).toBe(0.5);
  });

  it("breaks ties by record, then by id, whatever the order", () => {
    const tied = [team("b"), team("a"), team("c")];
    expect(powerRankings(tied).map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(powerRankings([...tied].reverse()).map((r) => r.teamId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("copes with an empty league", () => {
    expect(powerRankings([])).toEqual([]);
  });
});
