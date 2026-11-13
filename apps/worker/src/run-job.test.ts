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
    expect(fake.commits.every((c) => c.plays.length > 100)).toBe(true);
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
    const shot = commit?.plays.find((p) => p.kind === "made-shot");
    expect(shot).toMatchObject({
      game_id: expect.any(String),
      shot_zone: expect.any(String),
      at_x: expect.any(Number),
      at_y: expect.any(Number),
      transition: expect.any(Boolean),
    });
    const start = commit?.plays.find((p) => p.kind === "period-start");
    expect(start).toMatchObject({ at_x: null, at_y: null, player_id: null });
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
    const fake = fakeDb({ seasonPhase: "playoffs" });
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
});
