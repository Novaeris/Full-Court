"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AI_ASSIST_KEYS, AI_ASSIST_LABELS } from "@fullcourt/game-types";

type Flags = Record<(typeof AI_ASSIST_KEYS)[number], boolean>;
type ErrorBody = { error?: { message?: string } };

/** What each switch does in the offseason, for the jobs that exist so far. */
const EFFECT: Record<(typeof AI_ASSIST_KEYS)[number], string> = {
  drafting: "Makes your draft picks. Off, the draft waits for you.",
  scouting: "Ranks the draft board for your needs. Off, you rank it yourself.",
  rosterManagement:
    "Signs and releases players for you in free agency and the preseason.",
  rosterCoverage:
    "Keeps your roster at 12 to 15 players with every position covered.",
  trades: "Not built yet.",
};

/**
 * AI Assist for one of your franchises. On means the AI does that job for the
 * team, the way it does for a computer team; off means you do it and the game
 * waits for you. Changes save as soon as they are made.
 */
export function AiAssistPanel({
  leagueId,
  teamId,
  flags,
}: {
  leagueId: string;
  teamId: string;
  flags: Flags;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(flags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof Flags, value: boolean) {
    setBusy(true);
    setError(null);
    const previous = current;
    setCurrent({ ...current, [key]: value });
    try {
      const response = await fetch(`/api/v1/leagues/${leagueId}/ai-assist`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, aiAssist: { [key]: value } }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setCurrent(previous);
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
      } else {
        router.refresh();
      }
    } catch {
      setCurrent(previous);
      setError("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  return (
    <section
      aria-labelledby="assist-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="assist-heading" className="text-xl font-bold">
        AI Assist
      </h2>
      <p className="mt-1 text-text-muted">
        For when you would rather not do a job yourself, or want to simulate
        through. Switched on, the AI does that job for your team; switched off,
        you do it and the offseason waits for you.
      </p>
      <ul className="mt-3">
        {AI_ASSIST_KEYS.map((key) => {
          const id = `assist-${key}`;
          return (
            <li
              key={key}
              className="flex items-start justify-between gap-4 border-t border-border py-3 first:border-t-0"
            >
              <div className="min-w-0">
                <label htmlFor={id} className="font-semibold">
                  {AI_ASSIST_LABELS[key].name}
                </label>
                <p className="text-sm text-text-muted">{EFFECT[key]}</p>
              </div>
              <input
                id={id}
                type="checkbox"
                role="switch"
                className="mt-1 size-6 shrink-0 accent-accent"
                checked={current[key]}
                disabled={busy || key === "trades"}
                onChange={(e) => toggle(key, e.target.checked)}
              />
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
