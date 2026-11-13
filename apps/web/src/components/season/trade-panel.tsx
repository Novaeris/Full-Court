"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  ShopResponse,
  Team,
  TradeEvaluation,
  TradePartnerResponse,
  TradePlayer,
  TradesResponse,
} from "@fullcourt/validation";
import { Button } from "@/components/ui/button";
import { money } from "./free-agency-panel";

type ErrorBody = { error?: { message?: string } };

function teamLabel(teams: readonly Team[], id: string): string {
  const t = teams.find((x) => x.id === id);
  return t ? `${t.city} ${t.nickname}` : "Team";
}

function Line({
  p,
  checked,
  onToggle,
  label,
}: {
  p: TradePlayer;
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  const id = `${label}-${p.id}`;
  return (
    <li className="flex items-start gap-3 border-t border-border py-2 first:border-t-0">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-6 shrink-0 accent-accent"
        checked={checked}
        onChange={onToggle}
      />
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="font-semibold">{p.name}</span>
        <span className="block text-sm text-text-muted">
          {p.position} · age {p.age} · {p.overall} overall · {p.potential}{" "}
          potential · {money(p.salary)} for {p.yearsLeft}{" "}
          {p.yearsLeft === 1 ? "season" : "seasons"}
        </span>
      </label>
    </li>
  );
}

/**
 * Trades: pick a computer team, pick the players on each side, check what it
 * would say, and propose. Or shop your players and see what the computer teams
 * would give for them.
 */
export function TradePanel({
  leagueId,
  data,
  teams,
}: {
  leagueId: string;
  data: TradesResponse;
  teams: readonly Team[];
}) {
  const router = useRouter();
  const [partner, setPartner] = useState<string>("");
  const [theirs, setTheirs] = useState<TradePartnerResponse | null>(null);
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<TradeEvaluation | null>(null);
  const [made, setMade] = useState(false);
  const [shop, setShop] = useState<ShopResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call<T>(
    path: string,
    method: "GET" | "POST",
    body?: object,
  ): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/leagues/${leagueId}/trades${path}`,
        {
          method,
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
        return null;
      }
      return json as T;
    } catch {
      setError("Couldn't reach the server. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function choosePartner(id: string) {
    setPartner(id);
    setGet([]);
    setEvaluation(null);
    setMade(false);
    setTheirs(null);
    if (!id) return;
    const roster = await call<TradePartnerResponse>(
      `/partner?partner=${encodeURIComponent(id)}`,
      "GET",
    );
    if (roster) setTheirs(roster);
  }

  const body = () => ({ teamId: data.teamId, partnerId: partner, give, get });
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setEvaluation(null);
    setMade(false);
  };

  async function check() {
    const result = await call<TradeEvaluation>("/evaluate", "POST", body());
    if (result) setEvaluation(result);
  }

  async function propose() {
    const result = await call<{ evaluation: TradeEvaluation; done: boolean }>(
      "",
      "POST",
      body(),
    );
    if (!result) return;
    setEvaluation(result.evaluation);
    if (result.done) {
      setMade(true);
      setGive([]);
      setGet([]);
      router.refresh();
    }
  }

  async function shopSelected() {
    const result = await call<ShopResponse>("/shop", "POST", {
      teamId: data.teamId,
      playerIds: give,
    });
    if (result) setShop(result);
  }

  function takeOffer(offer: ShopResponse["offers"][number]) {
    void choosePartner(offer.teamId).then(() => {
      setGet(offer.get.map((p) => p.id));
    });
  }

  if (!data.open) {
    return (
      <section
        aria-labelledby="trade-heading"
        className="rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="trade-heading" className="text-xl font-bold">
          Trades
        </h2>
        <p className="mt-1 text-text-muted">
          {data.closedReason ?? "Trades are closed."}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="trade-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="trade-heading" className="text-xl font-bold">
        Trades
      </h2>
      <p className="mt-1 text-text-muted">
        {data.deadlineDay !== null
          ? `Trades are open until game day ${data.deadlineDay} (it is day ${data.day}). `
          : "Trades are open. "}
        Pick a team and the players on each side. A team over the cap after a
        trade can take back at most 125% of the salary it sends out, and nobody
        can pass the hard ceiling.
      </p>
      <p className="mt-1 text-sm text-text-muted">
        Your payroll {money(data.payroll)} of a {money(data.cap)} cap.
      </p>

      <label className="mt-4 block font-semibold" htmlFor="trade-partner">
        Trade with
      </label>
      <select
        id="trade-partner"
        className="mt-1 min-h-touch w-full max-w-full rounded-md border border-border bg-surface px-2 tablet:w-auto"
        value={partner}
        disabled={busy}
        onChange={(e) => void choosePartner(e.target.value)}
      >
        <option value="">Choose a team</option>
        {data.partners.map((t) => (
          <option key={t.teamId} value={t.teamId}>
            {teamLabel(teams, t.teamId)} ({t.size} players, {money(t.payroll)})
          </option>
        ))}
      </select>

      <div className="mt-4 grid gap-6 desktop:grid-cols-2">
        <div className="min-w-0">
          <h3 className="font-bold">You give</h3>
          <ul>
            {data.roster.map((p) => (
              <Line
                key={p.id}
                p={p}
                label="give"
                checked={give.includes(p.id)}
                onToggle={() => toggle(give, setGive, p.id)}
              />
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="font-bold">
            {partner ? `${teamLabel(teams, partner)} give` : "They give"}
          </h3>
          {theirs ? (
            <ul>
              {theirs.roster.map((p) => (
                <Line
                  key={p.id}
                  p={p}
                  label="get"
                  checked={get.includes(p.id)}
                  onToggle={() => toggle(get, setGet, p.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">Choose a team to see its roster.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy || !partner || give.length + get.length === 0}
          onClick={check}
        >
          Check the trade
        </Button>
        <Button
          variant="primary"
          disabled={busy || !partner || give.length + get.length === 0}
          onClick={propose}
        >
          Propose the trade
        </Button>
        <Button
          variant="ghost"
          disabled={busy || give.length === 0 || give.length > 3}
          onClick={shopSelected}
        >
          Shop the players I give
        </Button>
      </div>

      {evaluation ? (
        <div className="mt-3" role="status">
          <p className="font-semibold">
            {made
              ? "Trade made."
              : evaluation.legal && evaluation.accepts
                ? "They would accept."
                : "That trade doesn't work."}{" "}
            <span className="font-normal text-text-muted">
              It looks {evaluation.deal} to them. Payroll after: yours{" "}
              {money(evaluation.payrollAfter.yours)}, theirs{" "}
              {money(evaluation.payrollAfter.theirs)}.
            </span>
          </p>
          {[
            ...evaluation.problems,
            ...(evaluation.accepts ? [] : evaluation.reasons),
          ].map((reason) => (
            <p key={reason} className="text-sm text-text-muted">
              {reason.charAt(0).toUpperCase() + reason.slice(1)}.
            </p>
          ))}
        </div>
      ) : null}

      {shop ? (
        <div className="mt-5">
          <h3 className="font-bold">What they would give</h3>
          {shop.offers.length === 0 ? (
            <p className="text-text-muted">
              Nobody would make an offer for them.
            </p>
          ) : (
            <ul>
              {shop.offers.map((o) => (
                <li
                  key={`${o.teamId}-${o.get.map((p) => p.id).join()}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2 first:border-t-0"
                >
                  <span className="min-w-0">
                    <span className="font-semibold">
                      {teamLabel(teams, o.teamId)}
                    </span>{" "}
                    would give{" "}
                    {o.get
                      .map(
                        (p) => `${p.name} (${p.overall}, ${money(p.salary)})`,
                      )
                      .join(" and ")}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => takeOffer(o)}
                  >
                    Use this offer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <h3 className="mt-6 font-bold">Recent trades</h3>
      {data.history.length === 0 ? (
        <p className="text-text-muted">No trades yet.</p>
      ) : (
        <ul className="text-sm">
          {data.history.map((t) => (
            <li
              key={t.id}
              className="border-t border-border py-2 first:border-t-0"
            >
              <span className="text-text-muted">
                {t.day > 0 ? `Day ${t.day}: ` : `${t.seasonYear} offseason: `}
              </span>
              {teamLabel(teams, t.teamA)} traded{" "}
              {t.gaveA.map((p) => p.name).join(", ") || "nobody"} to{" "}
              {teamLabel(teams, t.teamB)} for{" "}
              {t.gaveB.map((p) => p.name).join(", ") || "nobody"}
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
