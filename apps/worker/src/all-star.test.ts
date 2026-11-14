import { describe, expect, it } from "vitest";
import type { AwardLine } from "@fullcourt/game-rules";
import {
  isAllStarDay,
  runAllStarGame,
  type AllStarRecord,
  type AllStarStore,
} from "./all-star";
import { fakeDb, fakePlayers } from "./test-fakes";
import { runJob } from "./run-job";

const season = { id: "s1", league_id: "league-1", year: 2026, day: 16 };

const lineFor = (id: string, i: number, games = 15): AwardLine => ({
  playerId: id,
  teamId: id.split("-")[0] as string,
  position: "SF",
  games,
  started: games,
  minutes: games * 28,
  points: (30 - i) * games,
  rebounds: 5 * games,
  assists: 3 * games,
  steals: games,
  blocks: games,
  turnovers: games,
  fgm: 6 * games,
  fga: 13 * games,
  ftm: 3 * games,
  fta: 4 * games,
  rookie: false,
});

/** A store over the fake league: 32 players, of whom the best 24 are picked. */
function store(over: Partial<{ has: boolean; lines: AwardLine[] }> = {}) {
  const players = fakePlayers(8);
  const recorded: AllStarRecord[] = [];
  const s: AllStarStore = {
    hasAllStarGame: async () => over.has ?? false,
    loadAllStarLines: async () =>
      over.lines ?? players.map((p, i) => lineFor(p.id, i)),
    loadAllStarPlayers: async (_id, ids) => ({
      players: players.filter((p) => ids.includes(p.id)),
      lastNames: new Map(players.map((p) => [p.id, p.id.toUpperCase()])),
    }),
    recordAllStarGame: async (_id, game) => {
      recorded.push(game);
    },
  };
  return { s, recorded };
}

describe("isAllStarDay", () => {
  it("is the one day half way through the season", () => {
    expect(isAllStarDay(15, 31)).toBe(true);
    expect(isAllStarDay(14, 31)).toBe(false);
    expect(isAllStarDay(16, 31)).toBe(false);
  });
});

describe("runAllStarGame", () => {
  it("plays and stores one game between two squads of twelve", async () => {
    const { s, recorded } = store();
    expect(await runAllStarGame(s, season)).toBe(true);
    expect(recorded).toHaveLength(1);
    const game = recorded[0] as AllStarRecord;
    expect(game.players).toHaveLength(24);
    expect(game.players.filter((p) => p.squad === "a")).toHaveLength(12);
    expect(game.players.filter((p) => p.squad === "b")).toHaveLength(12);
    expect(game.players.filter((p) => p.starter)).toHaveLength(10);
    expect(game.players.filter((p) => p.captain)).toHaveLength(2);
    // A real game: scores in a basketball range, and not a tie.
    expect(game.score_a).toBeGreaterThan(60);
    expect(game.score_b).toBeGreaterThan(60);
    expect(game.score_a).not.toBe(game.score_b);
    expect(game.name_a).toMatch(/^Team /);
    expect(game.name_a).not.toBe(game.name_b);
    // The points on the lines add up to the score, per squad.
    const sum = (squad: string) =>
      game.players
        .filter((p) => p.squad === squad)
        .reduce((n, p) => n + p.points, 0);
    expect(sum("a")).toBe(game.score_a);
    expect(sum("b")).toBe(game.score_b);
    // The MVP is on the winning squad.
    const winner = game.score_a > game.score_b ? "a" : "b";
    const mvp = game.players.find((p) => p.player_id === game.mvp_player_id);
    expect(mvp?.squad).toBe(winner);
    expect(game.day).toBe(16);
  });

  it("is the same game every time", async () => {
    const one = store();
    const two = store();
    await runAllStarGame(one.s, season);
    await runAllStarGame(two.s, season);
    expect(two.recorded).toEqual(one.recorded);
    const other = store();
    await runAllStarGame(other.s, { ...season, year: 2027 });
    expect(other.recorded).not.toEqual(one.recorded);
  });

  it("does nothing if the season already has its game", async () => {
    const { s, recorded } = store({ has: true });
    expect(await runAllStarGame(s, season)).toBe(false);
    expect(recorded).toEqual([]);
  });

  it("does nothing without 24 players who have played enough", async () => {
    const few = fakePlayers(8)
      .slice(0, 20)
      .map((p, i) => lineFor(p.id, i));
    const { s, recorded } = store({ lines: few });
    expect(await runAllStarGame(s, season)).toBe(false);
    expect(recorded).toEqual([]);
  });
});

describe("the job", () => {
  it("plays it once, before the middle day, and keeps going if it can't", async () => {
    const calls: number[] = [];
    const fake = fakeDb({ daysRequested: 3 });
    // The fake season is 3 days: the All-Star day is day 2 (never the first).
    Object.assign(fake.db, {
      hasAllStarGame: async () => false,
      loadAllStarLines: async () => {
        calls.push(fake.season.day);
        throw new Error("boom");
      },
      loadAllStarPlayers: async () => ({ players: [], lastNames: new Map() }),
      recordAllStarGame: async () => {},
    });
    await runJob(fake.db, fake.job);
    // Tried once, on day 2, failed, and the job still played every day.
    expect(calls).toEqual([2]);
    expect(fake.commits).toHaveLength(3);
    expect(fake.failures).toEqual([]);
  });
});
