import { execSync } from "node:child_process";

/**
 * Runs the simulation worker until the league's queue is empty, against the local
 * Supabase these tests use. It takes the Supabase URL and the secret key from
 * the environment (`apps/web/.env.local`, loaded by playwright.config.ts).
 * Several tests may run it at once: each worker claims only its own league's jobs.
 */
export function runWorker(leagueId: string): void {
  execSync("pnpm --filter @fullcourt/worker once", {
    stdio: "pipe",
    timeout: 180_000,
    // Only this league's jobs: another test may have left a job queued on
    // purpose, and a worker that took it would change what that test sees.
    env: { ...process.env, WORKER_ONLY_LEAGUE: leagueId },
  });
}

/**
 * Runs the worker until this league's simulation job has finished. Other tests
 * run workers too, and one of them may have claimed the job: wait for it.
 */
export async function finishJob(
  api: {
    leagues: {
      simulation: (id: string) => Promise<{ job: { status: string } | null }>;
    };
  },
  leagueId: string,
): Promise<void> {
  for (let i = 0; i < 120; i++) {
    runWorker(leagueId);
    const { job } = await api.leagues.simulation(leagueId);
    if (!job || !["queued", "running"].includes(job.status)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The simulation never finished.");
}
