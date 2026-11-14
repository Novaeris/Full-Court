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
  it("builds the teams in the day's games, with rosters and the style the roster suits", () => {
    const teams = toSimTeams(games, fakePlayers());
    expect(teams.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    for (const team of teams) {
      expect(team.players).toHaveLength(8);
      // Computer teams: modest shooters and not much speed, so slow and few threes.
      expect(team.strategy).toEqual({
        pace: "slow",
        threePointFocus: "low",
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

  it("plays a team's saved strategy and starters, and the default for the rest", () => {
    const players = fakePlayers();
    const five = players
      .filter((p) => p.team_id === "t1")
      .slice(0, 5)
      .map((p) => p.id);
    const teams = toSimTeams(games, players, [
      {
        id: "t1",
        strategy_pace: "fast",
        strategy_three_point: "high",
        strategy_defense: "interior",
        starters: five,
        rotation_size: null,
        local_player_slot: 1,
      },
    ]);
    const t1 = teams.find((t) => t.id === "t1");
    expect(t1?.strategy).toEqual({
      pace: "fast",
      threePointFocus: "high",
      defense: "interior",
    });
    expect(t1?.starters).toEqual(five);
    const t2 = teams.find((t) => t.id === "t2");
    // No owner: it plays the style its roster suits, with no named starters.
    expect(t2?.strategy.pace).toBe("slow");
    expect(t2?.starters).toBeUndefined();
  });

  it("falls back to the default for a value it doesn't know", () => {
    const teams = toSimTeams(games, fakePlayers(), [
      {
        id: "t1",
        strategy_pace: "reckless",
        strategy_three_point: "normal",
        strategy_defense: "balanced",
        starters: [],
        rotation_size: null,
        local_player_slot: 1,
      },
    ]);
    expect(teams.find((t) => t.id === "t1")?.strategy.pace).toBe("normal");
  });

  it("leaves out a hurt player, unless the team would be too short", () => {
    const hurt = (ids: string[]) =>
      fakePlayers(12).map((p) =>
        ids.includes(p.id) ? { ...p, injury_days: 5 } : p,
      );
    const roster = (list: ReturnType<typeof fakePlayers>) =>
      toSimTeams(games, list)
        .find((t) => t.id === "t1")
        ?.players.map((p) => p.id) ?? [];
    expect(roster(hurt(["t1-p1"]))).toHaveLength(11);
    expect(roster(hurt(["t1-p1"]))).not.toContain("t1-p1");
    // Seven of twelve hurt: only five are healthy, so three come back.
    const many = hurt([
      "t1-p1",
      "t1-p2",
      "t1-p3",
      "t1-p4",
      "t1-p5",
      "t1-p6",
      "t1-p7",
    ]);
    expect(roster(many)).toHaveLength(8);
  });

  it("replaces a starter who is hurt with the best healthy player", () => {
    const players = fakePlayers(10).map((p) =>
      p.id === "t1-p1" ? { ...p, injury_days: 3 } : p,
    );
    const named = ["t1-p1", "t1-p2", "t1-p3", "t1-p4", "t1-p5"];
    const t1 = toSimTeams(games, players, [
      {
        id: "t1",
        strategy_pace: "normal",
        strategy_three_point: "normal",
        strategy_defense: "balanced",
        starters: named,
        rotation_size: null,
        local_player_slot: 1,
      },
    ]).find((t) => t.id === "t1");
    expect(t1?.starters).toHaveLength(5);
    expect(t1?.starters).not.toContain("t1-p1");
    expect(new Set(t1?.starters).size).toBe(5);
    for (const id of t1?.starters ?? []) {
      expect(t1?.players.some((p) => p.id === id)).toBe(true);
    }
  });

  it("gives a team its head coach's bonus and its saved rotation size", () => {
    const coach = {
      id: "t1",
      strategy_pace: "normal",
      strategy_three_point: "normal",
      strategy_defense: "balanced",
      starters: [],
      rotation_size: 8,
      local_player_slot: 1,
    };
    const teams = toSimTeams(
      games,
      fakePlayers(),
      [coach],
      [
        { team_id: "t1", rating: 95 },
        { team_id: "t2", rating: 30 },
      ],
    );
    const t1 = teams.find((t) => t.id === "t1");
    const t2 = teams.find((t) => t.id === "t2");
    expect(t1?.coachBonus).toBe(2);
    expect(t1?.rotation).toBe(8);
    expect(t2?.coachBonus).toBe(-1.7);
    expect(t2?.rotation).toBeUndefined();
    // No head coach, no saved settings: nothing added.
    expect(toSimTeams(games, fakePlayers())[0]?.coachBonus).toBe(0);
  });

  it("ignores a rotation size the game doesn't offer", () => {
    const teams = toSimTeams(games, fakePlayers(), [
      {
        id: "t1",
        strategy_pace: "normal",
        strategy_three_point: "normal",
        strategy_defense: "balanced",
        starters: [],
        rotation_size: 3,
        local_player_slot: 1,
      },
    ]);
    expect(teams.find((t) => t.id === "t1")?.rotation).toBeUndefined();
  });

  describe("computer teams choose how to play", () => {
    /** Four teams' players, with one team's ratings changed. */
    const withRatings = (team: string, over: Record<string, number>) =>
      fakePlayers(10).map((p) => (p.team_id === team ? { ...p, ...over } : p));
    const styleOf = (list: ReturnType<typeof fakePlayers>, id: string) =>
      toSimTeams(games, list).find((t) => t.id === id)?.strategy;

    it("a team of shooters, runners and perimeter defenders plays that way", () => {
      const list = withRatings("t1", {
        three_point: 80,
        speed: 80,
        stamina: 78,
        perimeter_d: 78,
        interior_d: 55,
      });
      expect(styleOf(list, "t1")).toEqual({
        pace: "fast",
        threePointFocus: "high",
        defense: "perimeter",
      });
      // The other team's ratings didn't change, so neither did its style.
      expect(styleOf(list, "t2")).toEqual(styleOf(fakePlayers(10), "t2"));
    });

    it("a slow, interior team plays that way, and an ordinary team the usual way", () => {
      const list = withRatings("t1", {
        three_point: 50,
        speed: 50,
        stamina: 52,
        perimeter_d: 52,
        interior_d: 75,
      });
      expect(styleOf(list, "t1")).toEqual({
        pace: "slow",
        threePointFocus: "low",
        defense: "interior",
      });
      expect(
        styleOf(
          withRatings("t1", {
            three_point: 63,
            speed: 63,
            stamina: 63,
            perimeter_d: 63,
            interior_d: 62,
          }),
          "t1",
        ),
      ).toEqual({
        pace: "normal",
        threePointFocus: "normal",
        defense: "balanced",
      });
    });

    it("keeps its style when its best players are hurt", () => {
      const healthy = withRatings("t1", { three_point: 80 });
      const hurt = healthy.map((p) =>
        p.id === "t1-p1" || p.id === "t1-p2" ? { ...p, injury_days: 5 } : p,
      );
      expect(styleOf(hurt, "t1")).toEqual(styleOf(healthy, "t1"));
    });

    it("never overrides the strategy an owner saved, even the usual one", () => {
      const shooters = withRatings("t1", {
        three_point: 85,
        speed: 85,
        stamina: 85,
      });
      const saved = (pace: string) => ({
        id: "t1",
        strategy_pace: pace,
        strategy_three_point: "normal",
        strategy_defense: "balanced",
        starters: [],
        rotation_size: null,
        local_player_slot: 1,
      });
      for (const pace of ["slow", "normal"]) {
        const t = toSimTeams(games, shooters, [saved(pace)]).find(
          (x) => x.id === "t1",
        );
        expect(t?.strategy).toEqual({
          pace,
          threePointFocus: "normal",
          defense: "balanced",
        });
      }
    });
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
