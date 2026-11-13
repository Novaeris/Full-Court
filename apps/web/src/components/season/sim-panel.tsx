"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SimJob, SimKind, SimulationStatus } from "@fullcourt/validation";
import { Button } from "@/components/ui/button";

/** How often to ask the server how a running simulation is getting on. */
const POLL_MS = 1200;
/** After this long still queued, say that a worker has to pick the job up. */
const WAITING_MS = 6000;

const ACTIVE = new Set(["queued", "running"]);

type ErrorBody = { error?: { message?: string } };

async function call(
  leagueId: string,
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const response = await fetch(`/api/v1/leagues/${leagueId}/sim`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        message:
          (json as ErrorBody | null)?.error?.message ??
          "Something went wrong. Please try again.",
      };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Try again." };
  }
}

const PHASE_TEXT = {
  "regular-season": "Regular season",
  playoffs: "Playoffs",
  complete: "Season complete",
} as const;

/**
 * Advance the season and watch it happen. A day, a week or the rest of the
 * regular season is queued; a background worker plays it, and this panel
 * follows the job until it is done, then refreshes the page's data.
 */
export function SimPanel({
  leagueId,
  initial,
}: {
  leagueId: string;
  initial: SimulationStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SimulationStatus>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  const wasActive = useRef(
    initial.job ? ACTIVE.has(initial.job.status) : false,
  );

  const job = status.job;
  const active = job ? ACTIVE.has(job.status) : false;
  const season = status.season;
  const running = !season || season.phase === "regular-season";

  /**
   * Takes a fresh status. When a job has just ended, it says how it went and
   * reloads what the page shows. Runs from callbacks, never during render.
   */
  const apply = useCallback(
    (next: SimulationStatus) => {
      setStatus(next);
      const ended = next.job;
      if (ended && ACTIVE.has(ended.status)) {
        wasActive.current = true;
        return;
      }
      if (!wasActive.current || !ended) return;
      wasActive.current = false;
      if (ended.status === "done") {
        setMessage(
          ended.daysDone === 1
            ? "Simulated 1 day."
            : `Simulated ${ended.daysDone} days.`,
        );
      } else if (ended.status === "failed") {
        setMessage(null);
        setError(ended.error ?? "The simulation failed.");
      } else if (ended.status === "cancelled") {
        setMessage(
          ended.daysDone > 0
            ? `Cancelled after ${ended.daysDone} ${ended.daysDone === 1 ? "day" : "days"}.`
            : "Cancelled.",
        );
      }
      router.refresh();
    },
    [router],
  );

  const refresh = useCallback(async () => {
    const result = await call(leagueId, "GET");
    if (result.ok) apply(result.data as SimulationStatus);
  }, [leagueId, apply]);

  // Follow an active job until it finishes.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(refresh, POLL_MS);
    const waiting = setTimeout(() => setWaited(true), WAITING_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(waiting);
      setWaited(false);
    };
  }, [active, refresh]);

  async function start(kind: SimKind) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await call(leagueId, "POST", { kind });
    if (!result.ok) {
      setError(result.message);
    } else {
      setStatus((s) => ({ ...s, job: result.data as SimJob }));
      wasActive.current = true;
      await refresh();
    }
    setBusy(false);
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    const result = await call(leagueId, "DELETE");
    if (!result.ok) setError(result.message);
    await refresh();
    setBusy(false);
  }

  const day = season ? Math.min(season.day, season.lastDay) : 0;
  const played = season ? season.day - 1 : 0;
  const progress =
    job && active ? Math.round((job.daysDone / job.daysRequested) * 100) : 0;

  return (
    <section
      aria-label="Simulation"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">
          {season ? `${season.year} season` : "Season"}
        </h2>
        <p className="text-text-muted">
          {season
            ? season.phase === "regular-season"
              ? `${PHASE_TEXT[season.phase]}: day ${day} of ${season.lastDay}`
              : PHASE_TEXT[season.phase]
            : "Not started yet. The first simulation creates the schedule."}
        </p>
        {season ? (
          <progress
            className="mt-2 h-2 w-full overflow-hidden rounded-full accent-accent"
            value={Math.min(played, season.lastDay)}
            max={season.lastDay}
            aria-label={`Season progress: ${Math.min(played, season.lastDay)} of ${season.lastDay} days played`}
          />
        ) : null}
      </div>

      {running ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy || active}
            onClick={() => start("day")}
          >
            Sim day
          </Button>
          <Button
            variant="secondary"
            disabled={busy || active}
            onClick={() => start("week")}
          >
            Sim week
          </Button>
          <Button
            variant="secondary"
            disabled={busy || active}
            onClick={() => start("season")}
          >
            Sim to end of season
          </Button>
          {active ? (
            <Button variant="ghost" disabled={busy} onClick={cancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-text-muted">
          The regular season is over. Playoffs are coming in a later update.
        </p>
      )}

      {job && active ? (
        <div className="mt-4" role="status">
          <p className="font-semibold">
            {job.status === "queued"
              ? "Queued"
              : `Simulating: ${job.daysDone} of ${job.daysRequested} ${job.daysRequested === 1 ? "day" : "days"}`}
          </p>
          <progress
            className="mt-1 h-2 w-full overflow-hidden rounded-full accent-accent"
            value={job.daysDone}
            max={job.daysRequested}
            aria-label="Simulation progress"
          />
          <p className="mt-1 text-sm text-text-muted">
            {progress}% done
            {job.status === "queued" && waited
              ? ". Waiting for the simulation worker to pick it up."
              : ""}
          </p>
        </div>
      ) : null}

      <div aria-live="polite" className="mt-3 min-h-6">
        {message ? <p className="text-win">{message}</p> : null}
      </div>
      {error ? (
        <p role="alert" className="mt-1 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
