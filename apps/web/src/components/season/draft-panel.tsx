"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatHeight } from "@fullcourt/game-rules";
import type { DraftResponse, Team } from "@fullcourt/validation";
import { TeamBadge } from "@/components/leagues/team-badge";
import { Button } from "@/components/ui/button";

type ErrorBody = { error?: { message?: string } };

/**
 * The draft as one of your teams sees it: who is on the clock, the prospects
 * your scouts rate, and the buttons to make your pick, simulate to it, or have
 * the rest picked for you. The ratings are what the scouts see, not the truth.
 */
export function DraftPanel({
  leagueId,
  draft,
  teams,
  scoutingAssist,
}: {
  leagueId: string;
  draft: DraftResponse;
  teams: readonly Team[];
  /** AI Assist is ranking the board, so the suggestion is shown. */
  scoutingAssist: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const team = (id: string) => teams.find((t) => t.id === id);
  const clock = draft.onTheClock;
  const showSuggestion = scoutingAssist || revealed;

  async function send(path: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/leagues/${leagueId}/draft/${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
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

  if (!draft.lotteryHeld) {
    return (
      <section
        aria-labelledby="draft-panel-heading"
        className="rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="draft-panel-heading" className="text-xl font-bold">
          The draft
        </h2>
        <p className="mt-1 text-text-muted">
          The lottery hasn&apos;t been held. Hold it to set the order, then the
          picks are made one at a time.
        </p>
      </section>
    );
  }

  const clockTeam = clock ? team(clock.teamId) : undefined;
  return (
    <section
      aria-labelledby="draft-panel-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="draft-panel-heading" className="text-xl font-bold">
        The draft
      </h2>
      {clock ? (
        <p className="mt-1" role="status">
          <span className="font-semibold">
            Pick {clock.pick} (round {clock.round}):{" "}
          </span>
          {clockTeam ? (
            <span className="inline-flex items-center gap-2">
              <TeamBadge team={clockTeam} size="sm" />
              {clockTeam.abbreviation}
            </span>
          ) : null}{" "}
          {clock.yourPick ? (
            <span className="font-semibold">is on the clock: your pick.</span>
          ) : clock.mine ? (
            <span className="font-semibold">
              is on the clock: your pick (AI Assist will make it if you simulate
              on, or you can).
            </span>
          ) : (
            "is on the clock."
          )}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => send("sim", { mode: "my-pick" })}
        >
          Sim to my pick
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => send("sim", { mode: "auto" })}
        >
          Auto-pick the rest for me
        </Button>
        {!scoutingAssist && draft.suggestion ? (
          <Button
            variant="ghost"
            disabled={busy || revealed}
            onClick={() => setRevealed(true)}
          >
            Suggest a pick
          </Button>
        ) : null}
      </div>

      <h3 className="mt-5 font-bold">Prospects</h3>
      <p className="text-sm text-text-muted">
        What your scouts see: a better scout means a clearer view.
      </p>
      {draft.board.length === 0 ? (
        <p className="mt-2 text-text-muted">Nobody left on the board.</p>
      ) : (
        <ul className="mt-2">
          {draft.board.slice(0, 25).map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2 first:border-t-0"
            >
              <p className="min-w-0">
                <span className="font-semibold">{p.name}</span>{" "}
                {showSuggestion && draft.suggestion === p.id ? (
                  <span className="ml-1 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-on-accent-soft">
                    Suggested
                  </span>
                ) : null}
                <span className="block text-sm text-text-muted">
                  {p.position} · age {p.age} · {formatHeight(p.heightInches)} ·
                  scouted {p.overall} overall, {p.potential} potential
                </span>
              </p>
              {clock?.mine ? (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => send("pick", { prospectId: p.id })}
                >
                  Draft
                  <span className="sr-only"> {p.name}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
