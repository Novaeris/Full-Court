"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TradesResponse } from "@fullcourt/validation";
import { Button } from "@/components/ui/button";
import { money } from "./free-agency-panel";

type ErrorBody = { error?: { message?: string } };

/** The most players the block holds. */
const MOST = 5;

/**
 * Your trading block: up to five players you are willing to trade. The
 * computer teams make offers for these players (instead of for whoever they
 * like of your best eight), so you hear what the league would give for them.
 */
export function TradingBlockPanel({
  leagueId,
  data,
}: {
  leagueId: string;
  data: TradesResponse;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(data.block);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data.teamId) return null;
  const same =
    chosen.length === data.block.length &&
    chosen.every((id) => data.block.includes(id));

  function toggle(id: string) {
    setMessage(null);
    setChosen((now) =>
      now.includes(id)
        ? now.filter((x) => x !== id)
        : now.length >= MOST
          ? now
          : [...now, id],
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/leagues/${leagueId}/trades/block`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: data.teamId, playerIds: chosen }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
        return;
      }
      setMessage(
        chosen.length === 0
          ? "The block is empty: offers are for your best players again."
          : `${chosen.length} on the block. Offers for them appear under Offers to you.`,
      );
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="block-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="block-heading" className="text-xl font-bold">
        Trading block
      </h2>
      <p className="mt-1 text-text-muted">
        Choose up to {MOST} players you are willing to trade. Computer teams
        make offers for them. With nobody on the block, they make offers for
        whichever of your best players they like.
      </p>
      <ul className="mt-3">
        {data.roster.map((p) => {
          const id = `block-${p.id}`;
          const on = chosen.includes(p.id);
          return (
            <li
              key={p.id}
              className="flex items-center justify-between gap-4 border-t border-border py-2 first:border-t-0"
            >
              <label htmlFor={id} className="min-w-0 flex-1">
                <span className="font-semibold">{p.name}</span>{" "}
                <span className="text-text-muted">
                  {p.position} · {p.overall} overall · {money(p.salary)} for{" "}
                  {p.yearsLeft} {p.yearsLeft === 1 ? "more year" : "more years"}
                </span>
              </label>
              <input
                id={id}
                type="checkbox"
                className="size-6 shrink-0 accent-accent"
                checked={on}
                disabled={busy || (!on && chosen.length >= MOST)}
                onChange={() => toggle(p.id)}
              />
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={busy || same} onClick={() => void save()}>
          Save the block
        </Button>
        <span className="text-sm text-text-muted">
          {chosen.length} of {MOST}
        </span>
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
