import type { WorkerDb } from "./db";
import { describeError } from "./errors";
import { runJob } from "./run-job";

const log = (message: string): void => {
  console.log(`${new Date().toISOString()} ${message}`);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The worker loop: put quiet jobs back in the queue, claim the next job, play
 * it, repeat. With `once` it stops when the queue is empty (for tests and
 * one-off runs); otherwise it polls until `shouldStop` says so.
 */
export async function work(
  db: WorkerDb,
  options: {
    workerId: string;
    pollMs: number;
    staleAfterMs: number;
    once: boolean;
    shouldStop: () => boolean;
    log?: (message: string) => void;
  },
): Promise<void> {
  const say = options.log ?? log;
  let lastRequeue = 0;
  let failures = 0;
  while (!options.shouldStop()) {
    try {
      if (Date.now() - lastRequeue >= Math.min(options.staleAfterMs, 30_000)) {
        const requeued = await db.requeueStale(options.staleAfterMs);
        lastRequeue = Date.now();
        if (requeued > 0) say(`requeued ${requeued} stale job(s)`);
      }

      const job = await db.claimJob(options.workerId);
      failures = 0;
      if (job) {
        say(
          `claimed job ${job.id} (${job.kind}, ${job.days_requested} day(s))`,
        );
        try {
          await runJob(db, job, say);
        } catch (error) {
          // A database or network problem: leave the job running. Its heartbeat
          // goes stale and it is requeued, resuming at the next uncommitted day.
          say(`job ${job.id}: ${describeError(error)}`);
          await sleep(options.pollMs);
        }
        continue;
      }
      if (options.once) return;
      await sleep(options.pollMs);
    } catch (error) {
      // Looking for work failed (a dropped connection, a timeout). That is
      // no reason to stop a worker that has been running for days: wait and
      // look again. A run that must end (`once`) gives up if it keeps failing.
      failures++;
      say(
        `looking for work failed (${failures} in a row): ${describeError(error)}`,
      );
      if (options.once && failures >= MAX_FAILURES_IN_A_ROW) throw error;
      await sleep(options.pollMs);
    }
  }
}

/** How many times in a row looking for work may fail before a `once` run gives up. */
export const MAX_FAILURES_IN_A_ROW = 5;
