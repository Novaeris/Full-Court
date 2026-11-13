"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StageInfo } from "@fullcourt/validation";
import { Button } from "@/components/ui/button";
import { formatDate } from "./format-date";

type ErrorBody = { error?: { message?: string } };

/**
 * Where the offseason is, with the dates of every stage, and the button that
 * takes the current stage's step: the draft, the end of free agency, the
 * training camp, the opening of the regular season.
 */
export function OffseasonControls({
  leagueId,
  year,
  stages,
  action,
}: {
  leagueId: string;
  year: number;
  stages: readonly StageInfo[];
  action: { button: string; summary: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/leagues/${leagueId}/offseason/advance`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
      } else {
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  return (
    <section
      aria-label="The offseason"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 className="text-xl font-bold">{year} offseason</h2>
      <ol className="mt-4 grid gap-3 tablet:grid-cols-4">
        {stages.map((s) => (
          <li
            key={s.stage}
            aria-current={s.status === "current" ? "step" : undefined}
            className={[
              "rounded-md border px-3 py-2",
              s.status === "current"
                ? "border-accent bg-accent-soft text-on-accent-soft"
                : "border-border",
              s.status === "upcoming" ? "text-text-muted" : "",
            ].join(" ")}
          >
            <p className="font-semibold">
              {s.label}
              {s.status === "done" ? " (done)" : ""}
            </p>
            <p className="text-sm">
              {s.start === s.end
                ? formatDate(s.start, false)
                : `${formatDate(s.start, false)} to ${formatDate(s.end, false)}`}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-text-muted">{action.summary}</p>
      <div className="mt-3">
        <Button variant="primary" disabled={busy} onClick={advance}>
          {action.button}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
