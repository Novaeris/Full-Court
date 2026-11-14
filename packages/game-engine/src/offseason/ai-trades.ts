import {
  hardCeiling,
  tradeProblems,
  tradeValue,
  type TradeAsset,
} from "@fullcourt/game-rules";
import type { Rng } from "../rng/rng";
import { shuffle } from "../rng/helpers";
import { shopPlayers, type ShopTeam } from "./trades";

/**
 * Trades between teams the computer runs (docs/DESIGN.md, "Computer teams
 * trade"). Both teams must come out ahead by their own measure: a position a
 * team is short of is worth 10% more to it, so deals come from need, not from
 * one side being fooled. Each team keeps its two best players, and a deal
 * must be legal (rosters, the hard ceiling and salary matching).
 */

/** A draft pick a team holds, worth `value` on the same scale as a player. */
export type PickAsset = { id: string; value: number };

export type AiTradeTeam = {
  id: string;
  payroll: number;
  roster: readonly TradeAsset[];
  /** Picks the team could trade; leave out for a team with none. */
  picks?: readonly PickAsset[] | undefined;
};

export type AiTrade = {
  teamA: string;
  teamB: string;
  fromA: string[];
  fromB: string[];
  picksA: string[];
  picksB: string[];
};

/** Each side must get at least this much more than it gives, by its own count. */
export const AI_TRADE_EDGE = 1.02;

/**
 * Up to `most` trades for one round, in a seeded order. A team and a player
 * are used once per round, so the result applies in any order. When a swap
 * pleases only one team, the other may add a pick to close the gap.
 */
export function proposeAiTrades(
  rng: Rng,
  input: {
    teams: readonly AiTradeTeam[];
    cap: number;
    inSeason: boolean;
    most: number;
  },
): AiTrade[] {
  const { cap, inSeason } = input;
  const ceiling = hardCeiling(cap);
  const value = (a: TradeAsset) => tradeValue(a, cap);
  const short = (t: AiTradeTeam, position: string) =>
    t.roster.filter((p) => p.position === position).length < 2;
  // Need counts only when the team isn't sending out a player at that position.
  const worth = (
    t: AiTradeTeam,
    list: readonly TradeAsset[],
    sending: readonly TradeAsset[],
  ) =>
    list.reduce(
      (s, a) =>
        s +
        value(a) *
          (short(t, a.position) &&
          !sending.some((o) => o.position === a.position)
            ? 1.1
            : 1),
      0,
    );
  const tradeable = (t: AiTradeTeam) => {
    const keep = new Set(
      [...t.roster]
        .sort((a, b) => value(b) - value(a))
        .slice(0, 2)
        .map((a) => a.id),
    );
    return t.roster.filter((a) => !keep.has(a.id));
  };

  const trades: AiTrade[] = [];
  const used = new Set<string>();
  const order = shuffle(rng, input.teams);
  for (const a of order) {
    if (trades.length >= input.most) break;
    if (used.has(a.id)) continue;
    const mine = tradeable(a);
    for (const b of shuffle(
      rng,
      order.filter((t) => t.id !== a.id && !used.has(t.id)),
    )) {
      const theirs = tradeable(b);
      let found: AiTrade | null = null;
      let best = 0;
      for (const x of mine) {
        for (const y of theirs) {
          const give = [x];
          const get = [y];
          const outA = value(x);
          const outB = value(y);
          const inA = worth(a, get, give);
          const inB = worth(b, give, get);
          // Picks: the side that is content can pay the other's shortfall.
          let pickA: PickAsset | undefined;
          let pickB: PickAsset | undefined;
          const gainA = inA >= outA * AI_TRADE_EDGE;
          const gainB = inB >= outB * AI_TRADE_EDGE;
          if (!gainA && gainB) {
            pickB = cheapest(b.picks, (p) => {
              return (
                inA + p.value >= outA * AI_TRADE_EDGE &&
                inB - p.value >= outB * AI_TRADE_EDGE
              );
            });
            if (!pickB) continue;
          } else if (gainA && !gainB) {
            pickA = cheapest(a.picks, (p) => {
              return (
                inB + p.value >= outB * AI_TRADE_EDGE &&
                inA - p.value >= outA * AI_TRADE_EDGE
              );
            });
            if (!pickA) continue;
          } else if (!gainA && !gainB) {
            continue;
          }
          const problems = tradeProblems({
            a: {
              payroll: a.payroll,
              size: a.roster.length,
              out: give,
              in: get,
            },
            b: {
              payroll: b.payroll,
              size: b.roster.length,
              out: get,
              in: give,
            },
            cap,
            ceiling,
            inSeason,
          });
          if (problems.length > 0) continue;
          const score =
            (inA + (pickB?.value ?? 0) - (pickA?.value ?? 0)) /
            Math.max(1, outA);
          if (found === null || score > best) {
            best = score;
            found = {
              teamA: a.id,
              teamB: b.id,
              fromA: give.map((p) => p.id),
              fromB: get.map((p) => p.id),
              picksA: pickA ? [pickA.id] : [],
              picksB: pickB ? [pickB.id] : [],
            };
          }
        }
      }
      if (!found) continue;
      trades.push(found);
      used.add(a.id);
      used.add(b.id);
      break;
    }
  }
  return trades;
}

/** The least valuable pick that passes `ok`. */
function cheapest(
  picks: readonly PickAsset[] | undefined,
  ok: (p: PickAsset) => boolean,
): PickAsset | undefined {
  return [...(picks ?? [])]
    .sort((x, y) => x.value - y.value || x.id.localeCompare(y.id))
    .find(ok);
}

/** An offer a computer team makes to the owner. */
export type OwnerOffer = {
  partnerId: string;
  /** What the owner would give and what he would get. */
  give: string[];
  get: string[];
  /** Picks the computer team adds. */
  getPicks: string[];
};

/**
 * Offers from computer teams to the owner: up to `most`, from different teams.
 * A computer team picks one of the owner's better players it would like (the
 * rest are not interesting enough to ask about; or, when the owner has a
 * trading block, one of those players), and offers the best package
 * `shopPlayers` finds for him. So every offer is one the team would make, is
 * legal for both sides, and is worth about what he is.
 */
export function proposeOwnerOffers(
  rng: Rng,
  input: {
    owner: { payroll: number; roster: readonly TradeAsset[] };
    teams: readonly ShopTeam[];
    cap: number;
    inSeason: boolean;
    most: number;
    /** Players the owner has put on the trading block: offers are for them alone. */
    block?: readonly string[] | undefined;
  },
): OwnerOffer[] {
  const value = (a: TradeAsset) => tradeValue(a, input.cap);
  // The owner's own list, if any of it is still on the roster: those players and
  // no others. Otherwise the eight best.
  const listed = new Set(input.block ?? []);
  const onBlock = input.owner.roster.filter((a) => listed.has(a.id));
  const wanted =
    onBlock.length > 0
      ? onBlock
      : [...input.owner.roster].sort((a, b) => value(b) - value(a)).slice(0, 8);
  const offers: OwnerOffer[] = [];
  const used = new Set<string>();
  for (const target of shuffle(rng, wanted)) {
    if (offers.length >= input.most) break;
    const best = shopPlayers({
      assets: [target],
      teams: input.teams.filter((t) => !used.has(t.id)),
      owner: input.owner,
      cap: input.cap,
      inSeason: input.inSeason,
    })[0];
    if (!best) continue;
    used.add(best.teamId);
    offers.push({
      partnerId: best.teamId,
      give: [target.id],
      get: best.get.map((a) => a.id),
      getPicks: best.getPicks.map((p) => p.id),
    });
  }
  return offers;
}
