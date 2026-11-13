"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OffseasonPlayer, RosterResponse } from "@fullcourt/validation";
import { money } from "./free-agency-panel";
import { Button } from "@/components/ui/button";

type ErrorBody = { error?: { message?: string } };

function line(p: OffseasonPlayer) {
  return (
    <span className="min-w-0">
      <span className="font-semibold">{p.name}</span>{" "}
      <span className="text-text-muted">
        {p.position} · age {p.age} · {p.overall} overall · {p.potential}{" "}
        potential
      </span>
    </span>
  );
}

/**
 * Your roster and the best free agents. From free agency to the end of the
 * preseason you can release players and sign free agents; the roster has to
 * be 12 to 15 players before free agency ends and before the season opens.
 * Signings have no cost yet: contracts come later.
 */
export function RosterPanel({
  leagueId,
  roster,
  freeAgencyDays,
}: {
  leagueId: string;
  roster: RosterResponse;
  /** Free agency's days are on: free agents are signed by offers, not here. */
  freeAgencyDays: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const size = roster.players.length;
  const legal = size >= roster.min && size <= roster.max;

  async function move(method: "POST" | "DELETE", playerId: string) {
    setBusy(playerId);
    setError(null);
    try {
      const response = await fetch(`/api/v1/leagues/${leagueId}/roster`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: roster.teamId, playerId }),
      });
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
    setBusy(null);
  }

  return (
    <section
      aria-labelledby="roster-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="roster-heading" className="text-xl font-bold">
        Roster moves
      </h2>
      <p className="mt-1" role="status">
        <span className="font-semibold">
          {size} {size === 1 ? "player" : "players"}
        </span>{" "}
        <span
          className={legal ? "text-text-muted" : "font-semibold text-danger"}
        >
          {legal
            ? `(a roster is ${roster.min} to ${roster.max})`
            : `(needs ${roster.min} to ${roster.max} before the stage can end)`}
        </span>
      </p>

      <h3 className="mt-4 font-bold">Your players</h3>
      <ul>
        {roster.players.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2 first:border-t-0"
          >
            {line(p)}
            {"salary" in p && p.salary ? (
              <span className="text-sm text-text-muted">
                {money(p.salary)}
                {"expires" in p && p.expires ? ` to ${p.expires}` : ""}
              </span>
            ) : null}
            {roster.open ? (
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => move("DELETE", p.id)}
              >
                Release
                <span className="sr-only"> {p.name}</span>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <h3 className="mt-5 font-bold">Free agents</h3>
      {freeAgencyDays ? (
        <p className="text-sm text-text-muted">
          During free agency&apos;s 21 days a free agent is signed by making an
          offer, in the Free agency section above. Only a player who would take
          a minimum contract can be signed here.
        </p>
      ) : (
        <p className="text-sm text-text-muted">
          The best {roster.freeAgents.length} of {roster.freeAgentTotal}. Now
          that free agency&apos;s days are over, a player can be signed for 75%
          of his asking price, for one year, if the cap rules allow it.
        </p>
      )}
      <ul>
        {roster.freeAgents.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2 first:border-t-0"
          >
            {line(p)}
            <span className="text-sm text-text-muted">
              asks {money(p.askSalary)}
            </span>
            {roster.open ? (
              <Button
                variant="secondary"
                disabled={busy !== null || size >= roster.max}
                onClick={() => move("POST", p.id)}
              >
                Sign
                <span className="sr-only"> {p.name}</span>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
