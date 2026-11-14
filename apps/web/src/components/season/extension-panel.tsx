"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  ExtendResult,
  ExtensionCandidate,
  ExtensionsResponse,
} from "@fullcourt/validation";
import { Button } from "@/components/ui/button";
import { money } from "./free-agency-panel";

type ErrorBody = { error?: { message?: string } };

const MOOD: Record<ExtensionCandidate["mood"], string> = {
  eager: "Eager to stay: he would sign for less than he asks.",
  willing: "Willing: he signs for about what he asks.",
  reluctant: "Reluctant: he wants more than he asks to stay.",
};

/**
 * Giving your players new contracts before their old ones end. He signs if the
 * offer is worth at least what he asks to him (the salary, adjusted for how he
 * sees your team): below that he says what he would sign for.
 */
export function ExtensionPanel({
  leagueId,
  data,
}: {
  leagueId: string;
  data: ExtensionsResponse;
}) {
  const router = useRouter();
  const [terms, setTerms] = useState<
    Record<string, { salary: string; years: number }>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data.teamId) return null;

  const termsFor = (c: ExtensionCandidate) =>
    terms[c.player.id] ?? {
      salary: String(c.minimum),
      years: Math.min(c.askYears, c.maxYears),
    };

  async function offer(c: ExtensionCandidate) {
    const t = termsFor(c);
    setBusy(c.player.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/leagues/${leagueId}/extensions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: data.teamId,
          playerId: c.player.id,
          salary: Number(t.salary),
          years: t.years,
        }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
        return;
      }
      const result = json as ExtendResult;
      setMessage(
        result.done
          ? `${c.player.name} signed: ${money(Number(t.salary))} a year for ${t.years} ${t.years === 1 ? "year" : "years"}.`
          : (result.reason ?? "He turned it down."),
      );
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="extensions-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="extensions-heading" className="text-xl font-bold">
        Contract extensions
      </h2>
      <p className="mt-1 text-text-muted">
        Give a player with two years or fewer left a new contract, from now. He
        signs if it is worth at least what he asks to him; the new salary
        replaces his old one at once and your payroll can&apos;t pass the hard
        ceiling
        {data.figures
          ? ` (${money(data.figures.ceiling)}, you are at ${money(data.figures.payroll)})`
          : ""}
        .
      </p>
      {!data.open ? (
        <p className="mt-3 text-text-muted">
          Extensions are open in the season and from free agency to the
          preseason.
        </p>
      ) : data.candidates.length === 0 ? (
        <p className="mt-3 text-text-muted">
          Nobody on your team is close enough to the end of his contract.
        </p>
      ) : (
        <ul className="mt-3">
          {data.candidates.map((c) => {
            const t = termsFor(c);
            const id = `extend-${c.player.id}`;
            return (
              <li
                key={c.player.id}
                className="border-t border-border py-3 first:border-t-0"
              >
                <p>
                  <span className="font-semibold">{c.player.name}</span>{" "}
                  <span className="text-text-muted">
                    {c.player.position} · age {c.player.age} ·{" "}
                    {c.player.overall} overall
                  </span>
                </p>
                <p className="text-sm text-text-muted">
                  Now {money(c.salary)} to {c.expires} ({c.yearsLeft}{" "}
                  {c.yearsLeft === 1 ? "year" : "years"} left). Asks{" "}
                  {money(c.askSalary)} for {c.askYears}. Signs for at least{" "}
                  {money(c.minimum)}. {MOOD[c.mood]}
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Salary a year (thousands) for {c.player.name}</span>
                    <input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={10}
                      className="min-h-touch w-36 rounded-md border border-border bg-surface px-2"
                      value={t.salary}
                      onChange={(e) =>
                        setTerms({
                          ...terms,
                          [c.player.id]: { ...t, salary: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Years for {c.player.name}</span>
                    <select
                      className="min-h-touch rounded-md border border-border bg-surface px-2"
                      value={t.years}
                      onChange={(e) =>
                        setTerms({
                          ...terms,
                          [c.player.id]: {
                            ...t,
                            years: Number(e.target.value),
                          },
                        })
                      }
                    >
                      {Array.from({ length: c.maxYears }, (_, i) => i + 1).map(
                        (n) => (
                          <option key={n} value={n}>
                            {n} {n === 1 ? "year" : "years"}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <Button
                    disabled={busy !== null || !data.open}
                    onClick={() => void offer(c)}
                  >
                    Offer extension
                    <span className="sr-only"> to {c.player.name}</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {message ? (
        <p role="status" className="mt-3 font-semibold">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
