"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CampResponse } from "@fullcourt/validation";
import { Button } from "@/components/ui/button";

type ErrorBody = { error?: { message?: string } };

/**
 * Training camp for your team: pick who goes (up to the places your head coach
 * earns) and what each works on. Leaving it empty lets your coaches choose.
 */
export function CampPanel({
  leagueId,
  camp,
}: {
  leagueId: string;
  camp: CampResponse;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<Record<string, string>>(
    Object.fromEntries(
      camp.roster.flatMap((r) => (r.program ? [[r.player.id, r.program]] : [])),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const going = Object.values(choice).filter(Boolean).length;
  const full = going >= camp.places;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/v1/leagues/${leagueId}/camp`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: camp.teamId,
          assignments: Object.entries(choice)
            .filter(([, program]) => program)
            .map(([playerId, program]) => ({ playerId, program })),
        }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  return (
    <section
      aria-labelledby="camp-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="camp-heading" className="text-xl font-bold">
        Training camp
      </h2>
      <p className="mt-1 text-text-muted">
        {going} of {camp.places} places used. A better head coach earns more
        places; a better development coach (or conditioning coach, for
        athleticism) means bigger gains; the young gain most.
      </p>
      <ul className="mt-3">
        {camp.roster.map(({ player }) => {
          const value = choice[player.id] ?? "";
          return (
            <li
              key={player.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2 first:border-t-0"
            >
              <p className="min-w-0">
                <span className="font-semibold">{player.name}</span>{" "}
                <span className="text-text-muted">
                  {player.position} · age {player.age} · {player.overall}{" "}
                  overall · {player.potential} potential
                </span>
              </p>
              <label>
                <span className="sr-only">Camp program for {player.name}</span>
                <select
                  className="min-h-touch rounded-md border border-border bg-surface px-2"
                  value={value}
                  disabled={!camp.open || busy}
                  onChange={(e) =>
                    setChoice({ ...choice, [player.id]: e.target.value })
                  }
                >
                  <option value="">Not going</option>
                  {camp.programs.map((p) => (
                    <option key={p.id} value={p.id} disabled={full && !value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          );
        })}
      </ul>
      {camp.open ? (
        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" disabled={busy} onClick={save}>
            Save camp roster
          </Button>
          {saved ? <p className="text-win">Saved.</p> : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
