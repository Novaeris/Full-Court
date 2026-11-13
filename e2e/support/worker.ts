import { execSync } from "node:child_process";

/**
 * Runs the simulation worker until the queue is empty, against the local
 * Supabase these tests use. It takes the Supabase URL and the secret key from
 * the environment (`apps/web/.env.local`, loaded by playwright.config.ts).
 * Several tests may run it at once: each worker claims different jobs.
 */
export function runWorker(): void {
  execSync("pnpm --filter @fullcourt/worker once", {
    stdio: "pipe",
    timeout: 180_000,
    env: { ...process.env },
  });
}
