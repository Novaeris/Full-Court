import { describe, expect, it, vi } from "vitest";
import { runJob } from "./run-job";
import { fakeDb } from "./test-fakes";

// A replay that disagrees with the game it came from, as would happen if a
// snapshot were missing something the engine reads.
vi.mock("@fullcourt/game-engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@fullcourt/game-engine")>();
  return {
    ...real,
    replayGame: (...args: Parameters<typeof real.replayGame>) => {
      const replayed = real.replayGame(...args);
      return { ...replayed, plays: replayed.plays.slice(0, -1) };
    },
  };
});

describe("runJob, when a replay doesn't reproduce its game", () => {
  it("fails the job and stores nothing", async () => {
    const fake = fakeDb({ daysRequested: 1 });
    await runJob(fake.db, fake.job);
    expect(fake.commits).toEqual([]);
    expect(fake.failures).toHaveLength(1);
    expect(fake.failures[0]?.message).toMatch(
      /^Day 1 could not be simulated: The replay of game g-1-1 does not reproduce it\./,
    );
  });
});
