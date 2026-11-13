import { randomUUID } from "node:crypto";

export type WorkerConfig = {
  supabaseUrl: string;
  /** The Supabase secret (service-role) key. Only this app and the web admin modules may hold it. */
  secretKey: string;
  workerId: string;
  /** How long to wait before looking for jobs again when the queue is empty. */
  pollMs: number;
  /** A running job whose last commit is older than this goes back in the queue. */
  staleAfterMs: number;
  /** Stop when the queue is empty instead of waiting for more jobs. */
  once: boolean;
};

const number = (
  value: string | undefined,
  fallback: number,
  min: number,
): number => {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`Expected a number of at least ${min}, got "${value}".`);
  }
  return n;
};

/** Reads the worker's settings from the environment and command line. */
export function readConfig(
  env: Record<string, string | undefined>,
  argv: readonly string[],
): WorkerConfig {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not set.");
  }
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set.");
  }
  return {
    supabaseUrl,
    secretKey,
    workerId:
      env.WORKER_ID ??
      env.RENDER_INSTANCE_ID ??
      `worker-${randomUUID().slice(0, 8)}`,
    pollMs: number(env.POLL_INTERVAL_MS, 2000, 100),
    staleAfterMs: number(env.STALE_AFTER_MS, 5 * 60 * 1000, 10_000),
    once: argv.includes("--once"),
  };
}
