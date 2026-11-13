import { describe, expect, it } from "vitest";
import type { GameRow } from "./db";
import { toDbPlay, toRngState, toSimTeams } from "./map";
import { fakePlayers } from "./test-fakes";

const games = [
  { id: "g1", home_team_id: "t1", away_team_id: "t2" },
] as GameRow[];

describe("toRngState", () => {
  it("accepts four 32-bit integers", () => {
    expect(toRngState([1, 2, 3, 4294967295])).toEqual([1, 2, 3, 4294967295]);
  });

  it("rejects anything else", () => {
    expect(() => toRngState([])).toThrow(/RNG state/);
    expect(() => toRngState([1, 2, 3])).toThrow(/RNG state/);
    expect(() => toRngState([1, 2, 3, -1])).toThrow(/RNG state/);
    expect(() => toRngState([1, 2, 3, 4294967296])).toThrow(/RNG state/);
    expect(() => toRngState([1, 2, 3, 1.5])).toThrow(/RNG state/);
  });
});

describe("toSimTeams", () => {
  it("builds the teams in the day's games, with rosters and default strategy", () => {
    const teams = toSimTeams(games, fakePlayers());
    expect(teams.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    for (const team of teams) {
      expect(team.players).toHaveLength(8);
      expect(team.strategy).toEqual({
        pace: "normal",
        threePointFocus: "normal",
        defense: "balanced",
      });
    }
    const player = teams[0]?.players[0];
    expect(player?.ratings.midRange).toBe(58);
    expect(player?.ratings.threePoint).toBe(57);
  });

  it("leaves out free agents and other teams' players", () => {
    const players = [
      ...fakePlayers(),
      { ...fakePlayers()[0], id: "free", team_id: null },
    ] as ReturnType<typeof fakePlayers>;
    const teams = toSimTeams(games, players);
    expect(teams.flatMap((t) => t.players).some((p) => p.id === "free")).toBe(
      false,
    );
    expect(teams.flatMap((t) => t.players)).toHaveLength(16);
  });

  it("rejects an unknown position", () => {
    const players = fakePlayers().map((p) => ({ ...p, position: "G" }));
    expect(() => toSimTeams(games, players)).toThrow(/unknown position/);
  });
});

describe("toDbPlay", () => {
  it("flattens the court position and keeps nulls", () => {
    const row = toDbPlay({
      gameId: "g1",
      seq: 3,
      period: 1,
      clock: 700,
      kind: "made-shot",
      teamId: "t1",
      playerId: "p1",
      assistPlayerId: null,
      blockPlayerId: null,
      stealPlayerId: null,
      outPlayerId: null,
      shotZone: "three",
      made: true,
      offensive: null,
      points: 3,
      homeScore: 3,
      awayScore: 0,
      transition: false,
      at: { x: 80.5, y: 12 },
    });
    expect(row).toMatchObject({
      game_id: "g1",
      shot_zone: "three",
      at_x: 80.5,
      at_y: 12,
      assist_player_id: null,
    });
    expect(row).not.toHaveProperty("at");
  });
});
