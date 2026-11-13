"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  ShopResponse,
  Team,
  TradeEvaluation,
  TradePartnerResponse,
  TradePick,
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

/** What one side of a trade gave, in words: players, then picks. */
function gaveText(
  names: readonly string[],
  picks: readonly {
    seasonYear: number;
    round: number;
    originalTeamId: string;
  }[],
  teams: readonly Team[],
): string {
  const items = [
    ...names,
    ...picks.map(
      (p) =>
        `a ${p.seasonYear} round ${p.round} pick (${teamLabel(teams, p.originalTeamId)})`,
    ),
  ];
  return items.length > 0 ? items.join(", ") : "nobody";
}

function PickLine({
  p,
  teams,
  checked,
  onToggle,
  label,
}: {
  p: TradePick;
  teams: readonly Team[];
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
        <span className="font-semibold">
          {p.seasonYear} round {p.round} pick
        </span>
        <span className="block text-sm text-text-muted">
          {teamLabel(teams, p.originalTeamId)}&apos;s pick
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
  const [givePicks, setGivePicks] = useState<string[]>([]);
  const [getPicks, setGetPicks] = useState<string[]>([]);
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
    setGetPicks([]);
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

  const body = () => ({
    teamId: data.teamId,
    partnerId: partner,
    give,
    get,
    givePicks,
    getPicks,
  });
  const nothing = give.length + get.length === 0;
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
      setGivePicks([]);
      setGetPicks([]);
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

  async function answerOffer(offerId: string, action: "accept" | "decline") {
    const result = await call<TradesResponse>("/offers", "POST", {
      offerId,
      action,
    });
    if (result) router.refresh();
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
        Pick a team and the players and draft picks on each side. A team over
        the cap after a trade can take back at most 125% of the salary it sends
        out, and nobody can pass the hard ceiling.
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
          {data.picks.length > 0 ? (
            <>
              <h4 className="mt-3 font-semibold">Your draft picks</h4>
              <ul>
                {data.picks.map((p) => (
                  <PickLine
                    key={p.id}
                    p={p}
                    teams={teams}
                    label="give-pick"
                    checked={givePicks.includes(p.id)}
                    onToggle={() => toggle(givePicks, setGivePicks, p.id)}
                  />
                ))}
              </ul>
            </>
          ) : null}
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
          {theirs && theirs.picks.length > 0 ? (
            <>
              <h4 className="mt-3 font-semibold">Their draft picks</h4>
              <ul>
                {theirs.picks.map((p) => (
                  <PickLine
                    key={p.id}
                    p={p}
                    teams={teams}
                    label="get-pick"
                    checked={getPicks.includes(p.id)}
                    onToggle={() => toggle(getPicks, setGetPicks, p.id)}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy || !partner || nothing}
          onClick={check}
        >
          Check the trade
        </Button>
        <Button
          variant="primary"
          disabled={busy || !partner || nothing}
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

      {data.offers.length > 0 ? (
        <div className="mt-5">
          <h3 className="font-bold">Offers to you</h3>
          <ul>
            {data.offers.map((o) => (
              <li
                key={o.id}
                className="border-t border-border py-2 first:border-t-0"
              >
                <p>
                  <span className="font-semibold">
                    {teamLabel(teams, o.partnerId)}
                  </span>{" "}
                  offers{" "}
                  {o.get
                    .map((p) => `${p.name} (${p.overall}, ${money(p.salary)})`)
                    .join(" and ")}{" "}
                  for{" "}
                  {o.give
                    .map((p) => `${p.name} (${p.overall}, ${money(p.salary)})`)
                    .join(" and ")}
                </p>
                {o.problems.length > 0 ? (
                  <p className="text-sm text-text-muted">
                    Can&apos;t be accepted now: {o.problems.join("; ")}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-3">
                  <Button
                    disabled={busy || o.problems.length > 0}
                    onClick={() => void answerOffer(o.id, "accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void answerOffer(o.id, "decline")}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
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
              {gaveText(
                t.gaveA.map((p) => p.name),
                t.picksA,
                teams,
              )}{" "}
              to {teamLabel(teams, t.teamB)} for{" "}
              {gaveText(
                t.gaveB.map((p) => p.name),
                t.picksB,
                teams,
              )}
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
