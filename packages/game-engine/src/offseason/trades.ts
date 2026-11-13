import {
  answerTrade,
  hardCeiling,
  tradeProblems,
  tradeValue,
  type TradeAsset,
} from "@fullcourt/game-rules";

/**
 * Shopping a player: what the computer teams would give for him
 * (docs/DESIGN.md, "Trades and roster moves in the season"). Each team looks
 * through its roster for a package it would accept and that fits the cap and
 * roster limits for both teams, and the best few are returned.
 */

export type ShopTeam = {
  id: string;
  /** Player salaries. */
  payroll: number;
  roster: readonly TradeAsset[];
};

export type ShopOffer = {
  teamId: string;
  /** The players the computer team would send. */
  get: readonly TradeAsset[];
  /** What it gets in value and what it gives. */
  receives: number;
  gives: number;
  /** The package's value to the owner's team. */
  worth: number;
};

const MOST_OFFERS = 5;

/**
 * The offers the computer teams would make for `asset` (or several players),
 * best for the owner first. A package is one player or two; the owner's side
 * of the roster must still be legal.
 */
export function shopPlayers(input: {
  assets: readonly TradeAsset[];
  teams: readonly ShopTeam[];
  owner: { payroll: number; roster: readonly TradeAsset[] };
  cap: number;
  inSeason: boolean;
}): ShopOffer[] {
  const { cap, inSeason } = input;
  const ceiling = hardCeiling(cap);
  const offers: ShopOffer[] = [];
  const value = (a: TradeAsset) => tradeValue(a, cap);

  for (const team of input.teams) {
    const protectedIds = new Set(
      [...team.roster]
        .sort((a, b) => value(b) - value(a))
        .slice(0, 2)
        .map((a) => a.id),
    );
    const pool = team.roster.filter((a) => !protectedIds.has(a.id));
    const singles: TradeAsset[][] = pool.map((a) => [a]);
    const pairs: TradeAsset[][] = [];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        pairs.push([pool[i] as TradeAsset, pool[j] as TradeAsset]);
      }
    }
    let best: ShopOffer | null = null;
    for (const get of [...singles, ...pairs]) {
      const verdict = answerTrade({
        team: team.roster,
        gives: get,
        receives: input.assets,
        cap,
        inSeason,
      });
      if (!verdict.accepts) continue;
      const problems = tradeProblems({
        a: {
          payroll: input.owner.payroll,
          size: input.owner.roster.length,
          out: input.assets,
          in: get,
        },
        b: {
          payroll: team.payroll,
          size: team.roster.length,
          out: get,
          in: input.assets,
        },
        cap,
        ceiling,
        inSeason,
      });
      if (problems.length > 0) continue;
      const worth = get.reduce((s, a) => s + value(a), 0);
      if (!best || worth > best.worth) {
        best = {
          teamId: team.id,
          get,
          receives: verdict.receives,
          gives: verdict.gives,
          worth,
        };
      }
    }
    if (best) offers.push(best);
  }
  return offers.sort((a, b) => b.worth - a.worth).slice(0, MOST_OFFERS);
}
