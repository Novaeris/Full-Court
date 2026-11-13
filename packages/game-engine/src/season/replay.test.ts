import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import { simulateDay } from "./day";
import {
  ENGINE_VERSION,
  replayGame,
  restoreTeams,
  snapshotTeams,
  type ReplaySnapshot,
} from "./replay";
import { scheduledGame, testTeams } from "./test-league";

const teams = testTeams();
type Team = (typeof teams)[number];
const t = (i: number) => teams[i] as Team;

/** One day of 15 games, the way the worker would play it. */
function playDay(seed: string) {
  const games = Array.from({ length: 15 }, (_, i) =>
    scheduledGame(`g-${i}`, t(i * 2), t(i * 2 + 1), 1),
  );
  const result = simulateDay({
    games,
    teams,
    rngState: seedState(seed),
  });
  return { games, result };
}

describe("replays", () => {
  it("reproduce every game exactly, even after a JSON round trip", () => {
    const { games, result } = playDay("replay-day");
    expect(result.replays).toHaveLength(15);
    result.replays.forEach((stored, i) => {
      // What the database would hand back.
      const row = JSON.parse(JSON.stringify(stored)) as typeof stored;
      const game = games[i] as (typeof games)[number];
      const again = replayGame(game, row.snapshot, row.rngState);
      const original = result.games[i];
      expect(again.game.homeScore).toBe(original?.homeScore);
      expect(again.game.awayScore).toBe(original?.awayScore);
      expect(again.game.overtimes).toBe(original?.overtimes);
      const plays = result.plays.filter((p) => p.gameId === game.id);
      expect(again.plays).toEqual(plays);
      expect(again.boxScore).toEqual(result.boxScores[i]);
    });
  });

  it("don't depend on the other games of the day", () => {
    const { games, result } = playDay("replay-alone");
    const stored = result.replays[9];
    const game = games[9] as (typeof games)[number];
    const alone = replayGame(
      game,
      (stored as NonNullable<typeof stored>).snapshot,
      (stored as NonNullable<typeof stored>).rngState,
    );
    expect(alone.plays).toEqual(
      result.plays.filter((p) => p.gameId === game.id),
    );
  });

  it("record the engine version and the state before each game", () => {
    const { result } = playDay("replay-meta");
    expect(
      result.replays.every((r) => r.engineVersion === ENGINE_VERSION),
    ).toBe(true);
    expect(result.replays[0]?.rngState).toEqual(seedState("replay-meta"));
    const states = result.replays.map((r) => JSON.stringify(r.rngState));
    expect(new Set(states).size).toBe(15);
    expect(JSON.stringify(result.rngState)).not.toBe(states[14]);
  });

  it("are small, plain JSON", () => {
    const snapshot = snapshotTeams(t(0), t(1));
    const text = JSON.stringify(snapshot);
    expect(JSON.parse(text)).toEqual(snapshot);
    expect(text.length).toBeLessThan(4000);
    expect(text).not.toMatch(/null|undefined/);
  });

  it("capture the ratings, so changing one changes the replay", () => {
    const { games, result } = playDay("replay-ratings");
    const stored = result.replays[0] as NonNullable<(typeof result.replays)[0]>;
    const changed = JSON.parse(
      JSON.stringify(stored.snapshot),
    ) as ReplaySnapshot;
    for (const player of changed.home.players) player[3] = 99;
    const game = games[0] as (typeof games)[number];
    const again = replayGame(game, changed, stored.rngState);
    expect(again.plays).not.toEqual(
      result.plays.filter((p) => p.gameId === game.id),
    );
  });

  it("refuse a malformed snapshot", () => {
    const good = snapshotTeams(t(0), t(1));
    const clone = () => JSON.parse(JSON.stringify(good)) as ReplaySnapshot;

    expect(() => restoreTeams(good)).not.toThrow();
    expect(() => restoreTeams(null as never)).toThrow(/missing/);
    const badPosition = clone();
    (badPosition.home.players[0] as (string | number)[])[1] = "G";
    expect(() => restoreTeams(badPosition)).toThrow(/invalid player/);
    const short = clone();
    (short.away.players[0] as (string | number)[]).pop();
    expect(() => restoreTeams(short)).toThrow(/invalid player/);
    const badPace = clone();
    badPace.home.strategy[0] = "warp" as never;
    expect(() => restoreTeams(badPace)).toThrow(/invalid pace/);
    const noPlayers = clone();
    noPlayers.home.players = "nope" as never;
    expect(() => restoreTeams(noPlayers)).toThrow(/invalid team/);
  });
});

/** FNV-1a, 32 bit: a short fingerprint of a string. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Fingerprints of the plays of a fixed set of games, for every engine version.
 * Games are stored as recipes and replayed from them, so the engine's output
 * for a recipe must never change under the same version.
 *
 * If this test fails you changed what the simulation produces. That is
 * allowed, but it must be deliberate: increase ENGINE_VERSION in replay.ts and
 * add the new fingerprint below. Keep the old entries. Games already stored
 * under an older version can then show their scores but not a replay.
 */
const PINNED: Record<number, string> = {
  1: "5a7266a0",
};

describe("the engine's output", () => {
  it("only changes together with ENGINE_VERSION", () => {
    const rng = createRng(seedState("pinned-engine-output"));
    const day = simulateDay({
      games: [
        scheduledGame("p-1", t(0), t(1)),
        scheduledGame("p-2", t(2), t(3)),
        scheduledGame("p-3", t(4), t(5)),
        scheduledGame("p-4", t(6), t(7)),
      ],
      teams,
      rngState: rng.state(),
    });
    const actual = fingerprint(JSON.stringify(day.plays));
    const pinned = PINNED[ENGINE_VERSION];
    expect(
      pinned,
      `ENGINE_VERSION ${ENGINE_VERSION} has no pinned fingerprint. Add \`${ENGINE_VERSION}: "${actual}"\` to PINNED.`,
    ).toBeDefined();
    expect(
      actual,
      "The engine's output changed. If that is intended, bump ENGINE_VERSION in replay.ts and add the new fingerprint to PINNED.",
    ).toBe(pinned);
  });
});
