import { ENGINE_VERSION } from "@fullcourt/game-engine";
import { describe, expect, it } from "vitest";
import { CommitRefused, CommitRejected } from "./db";
import { runJob } from "./run-job";
import { fakeDb, fakePlayers } from "./test-fakes";

describe("runJob", () => {
  it("plays every requested day in order and commits each one", async () => {
    const fake = fakeDb();
    await runJob(fake.db, fake.job);
    expect(fake.commits.map((c) => c.day)).toEqual([1, 2, 3]);
    expect(fake.commits.every((c) => c.games.length === 2)).toBe(true);
    expect(fake.commits.every((c) => c.replays.length === 2)).toBe(true);
    expect(fake.job.status).toBe("done");
    expect(fake.season.phase).toBe("playoffs");
    expect(fake.failures).toEqual([]);
  });

  it("threads the RNG state from one day to the next", async () => {
    const fake = fakeDb();
    await runJob(fake.db, fake.job);
    const states = fake.commits.map((c) => JSON.stringify(c.rngState));
    expect(new Set(states).size).toBe(3);
    expect(states).not.toContain(JSON.stringify([11, 22, 33, 44]));
  });

  it("commits rows in the shape the database function expects", async () => {
    const fake = fakeDb({ daysRequested: 1 });
    await runJob(fake.db, fake.job);
    const [commit] = fake.commits;
    expect(commit?.games[0]).toMatchObject({
      id: "g-1-1",
      overtimes: expect.any(Number),
    });
    expect(commit?.replays).toHaveLength(2);
    const replay = commit?.replays[0] as Record<string, unknown>;
    expect(replay).toMatchObject({
      game_id: "g-1-1",
      engine_version: ENGINE_VERSION,
      rng_state: expect.any(Array),
      snapshot: { home: { id: "t1" }, away: { id: "t2" } },
    });
    expect(replay.rng_state).toHaveLength(4);
    expect(replay).not.toHaveProperty("plays");
    expect(commit?.lines[0]).toHaveProperty("fgm");
  });

  it("commits box scores that add up to the game scores", async () => {
    const fake = fakeDb();
    await runJob(fake.db, fake.job);
    for (const commit of fake.commits) {
      for (const game of commit.games) {
        const home = fake.commits
          .flatMap((c) => c.lines)
          .filter((l) => l.game_id === game.id);
        const total = home.reduce((sum, l) => sum + Number(l.points), 0);
        expect(total).toBe(game.home_score + game.away_score);
      }
    }
  });

  it("gives identical commits for identical input", async () => {
    const a = fakeDb();
    const b = fakeDb();
    await runJob(a.db, a.job);
    await runJob(b.db, b.job);
    expect(JSON.stringify(a.commits)).toBe(JSON.stringify(b.commits));
  });

  it("stops quietly when the job is cancelled, keeping committed days", async () => {
    const fake = fakeDb({
      commitError: { onCall: 2, error: new CommitRefused("job_not_running") },
    });
    await expect(runJob(fake.db, fake.job)).resolves.toBeUndefined();
    expect(fake.commits.map((c) => c.day)).toEqual([1]);
    expect(fake.failures).toEqual([]);
  });

  it("stops when another worker already committed the day", async () => {
    const fake = fakeDb({
      commitError: { onCall: 1, error: new CommitRefused("stale_day") },
    });
    await runJob(fake.db, fake.job);
    expect(fake.commits).toEqual([]);
    expect(fake.failures).toEqual([]);
  });

  it("fails the job, with a reason, when the data can't be simulated", async () => {
    const short = fakePlayers().filter(
      (p) => !(p.team_id === "t1" && p.id > "t1-p3"),
    );
    const fake = fakeDb({ players: short });
    await runJob(fake.db, fake.job);
    expect(fake.commits).toEqual([]);
    expect(fake.failures).toHaveLength(1);
    expect(fake.failures[0]?.message).toMatch(/^Day 1 could not be simulated/);
    expect(fake.failures[0]?.message).toMatch(/at least five players/);
  });

  it("leaves the job running on a database error so it can be requeued", async () => {
    const fake = fakeDb({ loadDayError: new Error("connection reset") });
    await expect(runJob(fake.db, fake.job)).rejects.toThrow("connection reset");
    expect(fake.failures).toEqual([]);
    expect(fake.job.status).toBe("running");
  });

  it("fails rather than simulate a season that is already over", async () => {
    const fake = fakeDb({ seasonPhase: "complete" });
    await runJob(fake.db, fake.job);
    expect(fake.commits).toEqual([]);
    expect(fake.failures[0]?.message).toMatch(/season is over/);
  });
});

describe("runJob, when the database rejects a day", () => {
  it("fails the job with the database's reason instead of retrying forever", async () => {
    const fake = fakeDb({
      commitError: {
        onCall: 2,
        error: new CommitRejected('23514 | violates check constraint "x"'),
      },
    });
    await expect(runJob(fake.db, fake.job)).resolves.toBeUndefined();
    expect(fake.commits.map((c) => c.day)).toEqual([1]);
    expect(fake.failures).toHaveLength(1);
    expect(fake.failures[0]?.message).toMatch(
      /^Day 2 was rejected by the database: 23514/,
    );
  });

  it("rolls injuries after each committed day, the same way each time", async () => {
    const first = fakeDb();
    await runJob(first.db, first.job);
    expect(first.injuryCalls.map((c) => c.day)).toEqual([1, 2, 3]);
    const second = fakeDb();
    await runJob(second.db, second.job);
    expect(second.injuryCalls).toEqual(first.injuryCalls);
    for (const call of first.injuryCalls) {
      for (const i of call.injuries) {
        expect(i.days).toBeGreaterThanOrEqual(1);
        expect(i.kind.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps going when injuries can't be stored, or the database has no such call", async () => {
    const failing = fakeDb({ injuryError: new Error("boom") });
    await runJob(failing.db, failing.job);
    expect(failing.commits).toHaveLength(3);
    expect(failing.failures).toEqual([]);
    const without = fakeDb({ withInjuries: false });
    await runJob(without.db, without.job);
    expect(without.commits).toHaveLength(3);
  });

  it("plays the day without a player who is hurt", async () => {
    const players = fakePlayers(10).map((p) =>
      p.id === "t1-p1" ? { ...p, injury_days: 4 } : p,
    );
    const fake = fakeDb({ players, daysRequested: 1 });
    await runJob(fake.db, fake.job);
    const played = fake.commits[0]?.lines.map((l) => l.player_id) ?? [];
    expect(played).not.toContain("t1-p1");
    expect(played.length).toBeGreaterThan(0);
  });
});
