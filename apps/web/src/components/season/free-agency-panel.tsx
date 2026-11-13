"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FreeAgencyResponse, Team } from "@fullcourt/validation";
import { Button } from "@/components/ui/button";
import { formatDate } from "./format-date";

type ErrorBody = { error?: { message?: string } };

/** Thousands of dollars as "$2.17M". */
export function money(thousands: number): string {
  return `$${(thousands / 1000).toFixed(2)}M`;
}

/** One line of the log. */
function describe(
  kind: FreeAgencyResponse["log"][number]["kind"],
  name: string,
  team: string,
): string {
  switch (kind) {
    case "signed":
      return `${name} signed with ${team}`;
    case "re-signed":
      return `${name} re-signed with ${team}`;
    case "released":
      return `${name} was released by ${team}`;
    case "contract-ended":
      return `${name}'s contract with ${team} ended`;
    case "drafted":
      return `${name} was drafted by ${team}`;
  }
}

/**
 * Free agency's 21 days. Make offers to free agents, then simulate a day (or a
 * week, or to the end): the computer teams make and raise offers too, and each
 * free agent may accept his best offer or hold out for a better one.
 */
export function FreeAgencyPanel({
  leagueId,
  data,
  teams,
}: {
  leagueId: string;
  data: FreeAgencyResponse;
  teams: readonly Team[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<
    Record<string, { salary: number; years: number }>
  >({});
  const f = data.figures;
  const team = (id: string | null) => teams.find((t) => t.id === id);

  async function call(
    key: string,
    path: string,
    method: "POST" | "DELETE",
    body: object,
  ) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/leagues/${leagueId}/free-agency/${path}`,
        {
          method,
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
    setBusy(null);
  }

  return (
    <section
      aria-labelledby="fa-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="fa-heading" className="text-xl font-bold">
        Free agency
      </h2>
      <p className="mt-1" role="status">
        <span className="font-semibold">
          Day {Math.min(data.day, data.days)} of {data.days}
        </span>
        {data.date ? (
          <span className="text-text-muted"> · {formatDate(data.date)}</span>
        ) : null}
        {!data.open ? (
          <span className="text-text-muted"> · the days are over</span>
        ) : null}
      </p>

      {f ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 tablet:grid-cols-4">
          <div>
            <dt className="text-sm text-text-muted">Payroll</dt>
            <dd className="font-semibold">{money(f.payroll)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Cap</dt>
            <dd className="font-semibold">{money(f.cap)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">
              {f.room >= 0 ? "Cap room" : "Over the cap"}
            </dt>
            <dd className="font-semibold">{money(Math.abs(f.room))}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Hard ceiling</dt>
            <dd className="font-semibold">{money(f.ceiling)}</dd>
          </div>
        </dl>
      ) : null}
      {f ? (
        <p className="mt-2 text-sm text-text-muted">
          Over the cap you can still re-sign your own free agents, use the
          mid-level exception (
          {f.midLevelAvailable
            ? `up to ${money(f.midLevel)}, not used yet`
            : "already used"}
          ) or offer the minimum ({money(f.minSalary)}). Nothing takes you past
          the ceiling.
        </p>
      ) : null}

      {data.open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy !== null}
            onClick={() => call("day", "sim", "POST", { days: 1 })}
          >
            Sim a day
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => call("week", "sim", "POST", { days: 7 })}
          >
            Sim a week
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => call("end", "sim", "POST", { days: "end" })}
          >
            Sim to the end
          </Button>
        </div>
      ) : null}

      {data.myOffers.length > 0 ? (
        <>
          <h3 className="mt-5 font-bold">Your offers</h3>
          <ul>
            {data.myOffers.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2 first:border-t-0"
              >
                <span>
                  <span className="font-semibold">{o.player.name}</span>{" "}
                  <span className="text-text-muted">
                    {money(o.salary)} for {o.years}{" "}
                    {o.years === 1 ? "year" : "years"}
                  </span>
                </span>
                {data.open ? (
                  <Button
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      call(o.id, "offers", "DELETE", {
                        teamId: data.teamId,
                        offerId: o.id,
                      })
                    }
                  >
                    Withdraw
                    <span className="sr-only"> offer to {o.player.name}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className="mt-5 font-bold">The market</h3>
      <p className="text-sm text-text-muted">
        The best {data.freeAgents.length} of {data.freeAgentTotal} free agents,
        with what each asks. An offer closer to what he asks is more likely to
        be accepted; at 110% he says yes at once, under 80% never.
      </p>
      <ul>
        {data.freeAgents.map((p) => {
          const t = terms[p.id] ?? { salary: p.askSalary, years: p.askYears };
          const id = `offer-${p.id}`;
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
            >
              <p className="min-w-0">
                <span className="font-semibold">{p.name}</span>{" "}
                {p.yours ? (
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-on-accent-soft">
                    Your rights
                  </span>
                ) : null}
                <span className="block text-sm text-text-muted">
                  {p.position} · age {p.age} · {p.overall} overall ·{" "}
                  {p.potential} potential · asks {money(p.askSalary)} for{" "}
                  {p.askYears} {p.askYears === 1 ? "year" : "years"}
                  {p.otherOffers > 0
                    ? ` · ${p.otherOffers} other ${p.otherOffers === 1 ? "offer" : "offers"}`
                    : ""}
                </span>
              </p>
              {data.open ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={id} className="sr-only">
                    Salary offer to {p.name}, in thousands of dollars a year
                  </label>
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={f?.minSalary}
                    max={f?.maxSalary}
                    step={10}
                    className="min-h-touch w-24 rounded-md border border-border bg-surface px-2"
                    value={t.salary}
                    onChange={(e) =>
                      setTerms({
                        ...terms,
                        [p.id]: { ...t, salary: Number(e.target.value) },
                      })
                    }
                  />
                  <label className="text-sm text-text-muted">
                    <span className="sr-only">Years for {p.name}</span>
                    <select
                      className="min-h-touch rounded-md border border-border bg-surface px-2"
                      value={t.years}
                      onChange={(e) =>
                        setTerms({
                          ...terms,
                          [p.id]: { ...t, years: Number(e.target.value) },
                        })
                      }
                    >
                      {[1, 2, 3, 4, 5].map((y) => (
                        <option key={y} value={y}>
                          {y} {y === 1 ? "year" : "years"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant={p.offer ? "secondary" : "primary"}
                    disabled={busy !== null}
                    onClick={() =>
                      call(p.id, "offers", "POST", {
                        teamId: data.teamId,
                        playerId: p.id,
                        salary: t.salary,
                        years: t.years,
                      })
                    }
                  >
                    {p.offer ? "Change offer" : "Offer"}
                    <span className="sr-only"> to {p.name}</span>
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <h3 className="mt-5 font-bold">What has happened</h3>
      {data.log.length === 0 ? (
        <p className="text-text-muted">Nothing yet.</p>
      ) : (
        <ul className="text-sm">
          {data.log.map((e, i) => (
            <li
              key={i}
              className="border-t border-border py-2 first:border-t-0"
            >
              <span className="text-text-muted">
                {e.day > 0 ? `Day ${e.day}: ` : ""}
              </span>
              {describe(
                e.kind,
                e.player.name,
                team(e.teamId)?.abbreviation ?? "",
              )}
              {e.salary !== null && e.years !== null
                ? ` (${money(e.salary)}, ${e.years} ${e.years === 1 ? "year" : "years"})`
                : ""}
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
