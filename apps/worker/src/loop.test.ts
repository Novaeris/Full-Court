import { describe, expect, it } from "vitest";
import { readConfig } from "./config";
import { work } from "./loop";
import { fakeDb } from "./test-fakes";

const quiet = () => {};

describe("work", () => {
  it("requeues stale jobs, claims a job, plays it and stops when the queue is empty", async () => {
    const fake = fakeDb();
    await work(fake.db, {
      workerId: "w1",
      pollMs: 100,
      staleAfterMs: 60_000,
      once: true,
      shouldStop: () => false,
      log: quiet,
    });
    expect(fake.requeueCalls()).toBe(1);
    expect(fake.commits).toHaveLength(3);
    expect(fake.job.status).toBe("done");
  });

  it("does nothing once told to stop", async () => {
    const fake = fakeDb();
    await work(fake.db, {
      workerId: "w1",
      pollMs: 100,
      staleAfterMs: 60_000,
      once: false,
      shouldStop: () => true,
      log: quiet,
    });
    expect(fake.commits).toEqual([]);
  });

  it("survives a database error and carries on", async () => {
    const fake = fakeDb({ loadDayError: new Error("timeout") });
    await work(fake.db, {
      workerId: "w1",
      pollMs: 100,
      staleAfterMs: 60_000,
      once: true,
      shouldStop: () => false,
      log: quiet,
    });
    expect(fake.failures).toEqual([]);
  });
});

describe("readConfig", () => {
  const env = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SECRET_KEY: "secret",
  };

  it("reads the environment with sensible defaults", () => {
    const config = readConfig({ ...env, WORKER_ID: "w9" }, []);
    expect(config).toMatchObject({
      supabaseUrl: "http://127.0.0.1:54321",
      secretKey: "secret",
      workerId: "w9",
      pollMs: 2000,
      staleAfterMs: 300_000,
      once: false,
    });
  });

  it("generates a worker id and reads --once", () => {
    const config = readConfig(env, ["--once"]);
    expect(config.workerId).toMatch(/^worker-[0-9a-f]{8}$/);
    expect(config.once).toBe(true);
  });

  it("falls back to the public URL variable", () => {
    const config = readConfig(
      {
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:1",
        SUPABASE_SECRET_KEY: "s",
      },
      [],
    );
    expect(config.supabaseUrl).toBe("http://localhost:1");
  });

  it("refuses to start without a URL or a secret key, or with a bad number", () => {
    expect(() => readConfig({ SUPABASE_SECRET_KEY: "s" }, [])).toThrow(/URL/);
    expect(() => readConfig({ SUPABASE_URL: "http://x" }, [])).toThrow(
      /SECRET_KEY/,
    );
    expect(() => readConfig({ ...env, POLL_INTERVAL_MS: "fast" }, [])).toThrow(
      /number/,
    );
    expect(() => readConfig({ ...env, POLL_INTERVAL_MS: "5" }, [])).toThrow(
      /at least/,
    );
  });
});
