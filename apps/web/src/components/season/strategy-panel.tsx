"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StrategyResponse } from "@fullcourt/validation";
import { Button } from "@/components/ui/button";

type ErrorBody = { error?: { message?: string } };
type Strategy = StrategyResponse["strategy"];

const PACE: { value: Strategy["pace"]; label: string; hint: string }[] = [
  { value: "slow", label: "Slow", hint: "Fewer possessions, each one longer." },
  { value: "normal", label: "Normal", hint: "The usual tempo." },
  {
    value: "fast",
    label: "Fast",
    hint: "More possessions and more fast breaks.",
  },
];
const THREES: { value: Strategy["threePointFocus"]; label: string }[] = [
  { value: "low", label: "Fewer threes" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "More threes" },
];
const DEFENSE: { value: Strategy["defense"]; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "perimeter", label: "Guard the perimeter" },
  { value: "interior", label: "Protect the paint" },
];

const SELECT = "min-h-touch rounded-md border border-border bg-surface px-2";

/**
 * How your team plays: pace, three-point focus and defence, and optionally the
 * five who start. Left automatic, the best player at each position starts. It
 * applies to the games played after you save.
 */
export function StrategyPanel({
  leagueId,
  data,
}: {
  leagueId: string;
  data: StrategyResponse;
}) {
  const router = useRouter();
  const [strategy, setStrategy] = useState(data.strategy);
  const [custom, setCustom] = useState(data.starters.length === 5);
  const [starters, setStarters] = useState<string[]>(
    data.starters.length === 5
      ? data.starters
      : data.roster.slice(0, 5).map((p) => p.id),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data.teamId) return null;
  const duplicates = custom && new Set(starters).size !== starters.length;

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/leagues/${leagueId}/strategy`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: data.teamId,
          strategy,
          starters: custom ? starters : [],
        }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
      } else {
        setMessage("Saved. It applies to your next game.");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="strategy-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="strategy-heading" className="text-xl font-bold">
        Strategy and starters
      </h2>
      <p className="mt-1 text-text-muted">
        How your team plays. It applies to the games played after you save.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Pace</span>
          <select
            className={SELECT}
            value={strategy.pace}
            onChange={(e) =>
              setStrategy({
                ...strategy,
                pace: e.target.value as Strategy["pace"],
              })
            }
          >
            {PACE.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-sm text-text-muted">
            {PACE.find((o) => o.value === strategy.pace)?.hint}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Three-point shooting</span>
          <select
            className={SELECT}
            value={strategy.threePointFocus}
            onChange={(e) =>
              setStrategy({
                ...strategy,
                threePointFocus: e.target.value as Strategy["threePointFocus"],
              })
            }
          >
            {THREES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Defence</span>
          <select
            className={SELECT}
            value={strategy.defense}
            onChange={(e) =>
              setStrategy({
                ...strategy,
                defense: e.target.value as Strategy["defense"],
              })
            }
          >
            {DEFENSE.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-6 accent-accent"
            checked={custom}
            onChange={(e) => setCustom(e.target.checked)}
          />
          <span className="font-semibold">Choose my starting five</span>
        </label>
        {custom ? (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {starters.map((id, i) => (
              <li key={i}>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-text-muted">
                    Starter {i + 1}
                  </span>
                  <select
                    className={SELECT}
                    value={id}
                    onChange={(e) =>
                      setStarters(
                        starters.map((s, j) => (j === i ? e.target.value : s)),
                      )
                    }
                  >
                    {data.roster.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.position}, {p.overall})
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-text-muted">
            The best player at each position starts.
          </p>
        )}
        {duplicates ? (
          <p role="alert" className="mt-2 font-semibold text-danger">
            Each starter has to be a different player.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={busy || duplicates} onClick={() => void save()}>
          Save strategy
        </Button>
        {message ? <p role="status">{message}</p> : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
