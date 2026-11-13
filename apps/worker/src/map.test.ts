import { describe, expect, it } from "vitest";
import type { GameRow } from "./db";
import { toDbReplay, toRngState, toSimTeams } from "./map";
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

describe("toDbReplay", () => {
  it("keeps what is needed to replay a game, in database column names", () => {
    const row = toDbReplay({
      gameId: "g1",
      engineVersion: 1,
      rngState: [1, 2, 3, 4],
      snapshot: {
        home: {
          id: "t1",
          strategy: ["normal", "normal", "balanced"],
          players: [],
        },
        away: { id: "t2", strategy: ["fast", "high", "interior"], players: [] },
      },
    });
    expect(row).toEqual({
      game_id: "g1",
      engine_version: 1,
      rng_state: [1, 2, 3, 4],
      snapshot: {
        home: {
          id: "t1",
          strategy: ["normal", "normal", "balanced"],
          players: [],
        },
        away: { id: "t2", strategy: ["fast", "high", "interior"], players: [] },
      },
    });
  });
});
