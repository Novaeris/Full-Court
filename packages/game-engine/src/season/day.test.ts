import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import { simulateDay } from "./day";
import { simulateGame } from "./game";
import { scheduledGame, testTeams } from "./test-league";

const teams = testTeams();
type Team = (typeof teams)[number];
const t = (i: number) => teams[i] as Team;
const games = [
  scheduledGame("g-1", t(0), t(1), 3),
  scheduledGame("g-2", t(2), t(3), 3),
  scheduledGame("g-3", t(4), t(5), 3),
];
const start = seedState("day");

describe("simulateDay", () => {
  it("plays every game and returns only changed rows", () => {
    const r = simulateDay({ games, teams, rngState: start });
    expect(r.games.map((g) => g.id)).toEqual(["g-1", "g-2", "g-3"]);
    expect(r.games.every((g) => g.status === "final" && g.day === 3)).toBe(
      true,
    );
    expect(r.boxScores.map((b) => b.gameId)).toEqual(["g-1", "g-2", "g-3"]);
    expect(new Set(r.plays.map((p) => p.gameId))).toEqual(
      new Set(["g-1", "g-2", "g-3"]),
    );
    expect(r.rngState).not.toEqual(start);
  });

  it("matches playing the games one by one with the same RNG", () => {
    const r = simulateDay({ games, teams, rngState: start });
    const rng = createRng(start);
    const pairs = [
      [t(0), t(1)],
      [t(2), t(3)],
      [t(4), t(5)],
    ] as const;
    games.forEach((g, i) => {
      const [home, away] = pairs[i] as (typeof pairs)[number];
      expect(simulateGame(g, home, away, rng).game).toEqual(r.games[i]);
    });
    expect(r.rngState).toEqual(rng.state());
  });

  it("is deterministic and doesn't change its input", () => {
    const before = JSON.stringify(games);
    expect(simulateDay({ games, teams, rngState: start })).toEqual(
      simulateDay({ games, teams, rngState: start }),
    );
    expect(JSON.stringify(games)).toBe(before);
  });

  it("can resume across days", () => {
    const day1 = simulateDay({
      games: [games[0] as (typeof games)[number]],
      teams,
      rngState: start,
    });
    const day2 = simulateDay({
      games: [games[1] as (typeof games)[number]],
      teams,
      rngState: day1.rngState,
    });
    expect(day2.rngState).not.toEqual(day1.rngState);
  });

  it("rejects replays, unknown teams and double-booked teams", () => {
    const done = simulateDay({ games, teams, rngState: start }).games;
    expect(() => simulateDay({ games: done, teams, rngState: start })).toThrow(
      /already/,
    );
    expect(() =>
      simulateDay({ games, teams: teams.slice(0, 2), rngState: start }),
    ).toThrow(/unknown/);
    expect(() =>
      simulateDay({
        games: [
          games[0] as (typeof games)[number],
          scheduledGame("g-9", t(1), t(2), 3),
        ],
        teams,
        rngState: start,
      }),
    ).toThrow(/twice/);
  });
});
