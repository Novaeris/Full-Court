import { describe, expect, it } from "vitest";
import { statLeaders, type StatTotals } from "./stats";

const row = (id: string, over: Partial<StatTotals> = {}): StatTotals => ({
  playerId: id,
  teamId: "t1",
  games: 10,
  started: 10,
  minutes: 300,
  points: 150,
  rebounds: 50,
  assists: 30,
  steals: 10,
  blocks: 5,
  turnovers: 20,
  fouls: 20,
  fgm: 60,
  fga: 130,
  tpm: 15,
  tpa: 40,
  ftm: 15,
  fta: 20,
  ...over,
});
const board = (rows: StatTotals[], id: string) =>
  statLeaders(rows).find((b) => b.id === id);

describe("statLeaders", () => {
  it("ranks per-game stats best first", () => {
    const b = board(
      [
        row("a", { points: 200 }),
        row("b", { points: 250 }),
        row("c", { points: 150 }),
      ],
      "points",
    );
    expect(b?.leaders.map((l) => l.playerId)).toEqual(["b", "a", "c"]);
    expect(b?.leaders[0]).toMatchObject({ value: 25, total: 250, games: 10 });
    expect(b?.unit).toBe("per game");
  });

  it("leaves out players who have played too few games", () => {
    const b = board(
      [row("a", { games: 10 }), row("b", { games: 3, points: 90 })],
      "points",
    );
    // b scores 30 a game but has played 3 of the 10: not ranked.
    expect(b?.leaders.map((l) => l.playerId)).toEqual(["a"]);
  });

  it("ranks percentages, and only for players who took enough shots", () => {
    const b = board(
      [
        row("a", { fgm: 70, fga: 130 }),
        row("b", { fgm: 5, fga: 5 }),
        row("c", { fgm: 55, fga: 100 }),
      ],
      "field-goal",
    );
    // b made 5 of 5 but took far fewer than 3 a game.
    expect(b?.leaders.map((l) => l.playerId)).toEqual(["c", "a"]);
    expect(b?.leaders.map((l) => l.value)).toEqual([55, 53.8]);
    expect(b?.unit).toBe("percent");
    expect(
      board([row("a", { tpm: 0, tpa: 0 })], "three-point")?.leaders,
    ).toEqual([]);
  });

  it("adds a traded player's rows into one, under the team he played most for", () => {
    const b = board(
      [
        row("a", { teamId: "t1", games: 4, points: 40 }),
        row("a", { teamId: "t2", games: 6, points: 110 }),
        row("b", { games: 10, points: 140 }),
      ],
      "points",
    );
    const a = b?.leaders.find((l) => l.playerId === "a");
    expect(a).toMatchObject({ teamId: "t2", games: 10, total: 150, value: 15 });
  });

  it("breaks ties by games played, then by id, and only lists the top ten", () => {
    const rows = Array.from({ length: 14 }, (_, i) =>
      row(`p${String(i).padStart(2, "0")}`, { points: 100 }),
    );
    const b = board(rows, "points");
    expect(b?.leaders).toHaveLength(10);
    expect(b?.leaders.map((l) => l.playerId)).toEqual(
      rows.slice(0, 10).map((r) => r.playerId),
    );
    const more = board(
      [row("z", { games: 10 }), row("a", { games: 9, points: 90 })],
      "points",
    );
    expect(more?.leaders[0]?.playerId).toBe("z");
  });

  it("is empty when nobody has played", () => {
    for (const b of statLeaders([])) expect(b.leaders).toEqual([]);
  });
});
