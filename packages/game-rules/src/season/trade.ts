import { askingSalary, minSalary } from "./finance";
import { playerValue } from "./offseason";

/**
 * Trades (docs/DESIGN.md, "Trades and roster moves in the season"): what a
 * player is worth, the salary-matching rule, the window, and how a computer
 * team answers. Pure; the server applies the answer and the database holds the
 * roster limits and the hard ceiling.
 */

/** Trades close this far through the regular season (two thirds). */
export function tradeDeadlineDay(lastDay: number): number {
  return Math.floor((lastDay * 2) / 3);
}

/** A computer team wants at least this much more than it gives. */
export const TRADE_MARGIN = 1.08;

/** It wants this much more to give up one of its two best players. */
export const STAR_MARGIN = 1.4;

export type TradeAsset = {
  id: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  /** Thousands of dollars a year. */
  salary: number;
  /** Seasons left on the contract, counting the current one. */
  yearsLeft: number;
};

/**
 * What a player is worth in a trade. His value (leaning on potential for the
 * young) is raised steeply, so stars are worth far more than depth; then the
 * contract: a player paid less than he asks, with years to run, is worth more,
 * an overpaid one less; and a veteran's worth falls with age.
 */
export function tradeValue(asset: TradeAsset, cap: number): number {
  const value = playerValue(asset.overall, asset.potential, asset.age);
  const base = Math.max(0, value - 42) ** 2.3;
  const ask = Math.max(askingSalary(asset, cap), minSalary(cap));
  const surplus = (ask - asset.salary) / ask;
  const years = Math.min(Math.max(asset.yearsLeft, 1), 3) / 3;
  const contract = Math.min(1.4, Math.max(0.6, 1 + 0.35 * surplus * years));
  const age = asset.age >= 33 ? 0.7 : asset.age >= 31 ? 0.85 : 1;
  return base * contract * age;
}

/**
 * The salary-matching rule: a team that ends the trade over the cap may take
 * back at most 125% of the salary it sends out, plus the minimum salary; a
 * team that ends under the cap needs no matching.
 */
export function salaryMatches(input: {
  payrollAfter: number;
  incoming: number;
  outgoing: number;
  cap: number;
}): boolean {
  if (input.payrollAfter <= input.cap) return true;
  return input.incoming <= input.outgoing * 1.25 + minSalary(input.cap);
}

/** Why a computer team said no, or that it said yes. */
export type TradeVerdict = {
  accepts: boolean;
  /** What the computer team receives, and what it gives, in trade value. */
  receives: number;
  gives: number;
  reasons: string[];
};

/**
 * How a computer team answers an offer. `team` is its roster before the trade
 * (every player with his contract), `gives` the players it would send and
 * `receives` those it would take. A position it is short of (fewer than two
 * players) makes an incoming player worth 10% more.
 */
export function answerTrade(input: {
  team: readonly TradeAsset[];
  gives: readonly TradeAsset[];
  receives: readonly TradeAsset[];
  cap: number;
  /** In the season a roster is 12 to 15; in the offseason it need only be at most 15. */
  inSeason: boolean;
}): TradeVerdict {
  const { cap } = input;
  const value = (a: TradeAsset) => tradeValue(a, cap);
  const short = (position: string) =>
    input.team.filter((p) => p.position === position).length < 2;
  const gives = input.gives.reduce((s, a) => s + value(a), 0);
  const receives = input.receives.reduce(
    (s, a) => s + value(a) * (short(a.position) ? 1.1 : 1),
    0,
  );
  const reasons: string[] = [];

  const size = input.team.length - input.gives.length + input.receives.length;
  if (size > 15) reasons.push("their roster would be too big");
  if (input.inSeason && size < 12)
    reasons.push("their roster would be too small");

  const best = [...input.team]
    .sort((a, b) => value(b) - value(a))
    .slice(0, 2)
    .map((a) => a.id);
  const givesStar = input.gives.some((a) => best.includes(a.id));
  const margin = givesStar ? STAR_MARGIN : TRADE_MARGIN;
  if (receives < gives * margin) {
    reasons.push(
      givesStar
        ? "they won't give up one of their best players for that"
        : "they want more in return",
    );
  }
  return { accepts: reasons.length === 0, receives, gives, reasons };
}

/** How good a deal an offer looks to the computer team, in words. */
export function dealWords(receives: number, gives: number): string {
  if (gives === 0) return "a gift";
  const ratio = receives / gives;
  if (ratio >= 1.4) return "very generous";
  if (ratio >= TRADE_MARGIN) return "good for them";
  if (ratio >= 0.9) return "close";
  return "not enough";
}

/** One side of a trade for the legality check. */
export type TradeSide = {
  /** The team's payroll before the trade (player salaries). */
  payroll: number;
  /** Players on its roster before the trade. */
  size: number;
  /** The players it sends and the players it takes. */
  out: readonly { salary: number }[];
  in: readonly { salary: number }[];
};

/**
 * Whether a trade is legal for both teams, as reasons it isn't (empty when it
 * is): at least one player each way, rosters of at most 15 (and at least 12 in
 * the season), nobody above the hard ceiling, and the salary-matching rule.
 */
export function tradeProblems(input: {
  a: TradeSide;
  b: TradeSide;
  cap: number;
  ceiling: number;
  inSeason: boolean;
}): string[] {
  const problems: string[] = [];
  if (input.a.out.length === 0 && input.b.out.length === 0) {
    problems.push("a trade needs a player on at least one side");
  }
  for (const [name, side] of [
    ["Your team", input.a],
    ["Their team", input.b],
  ] as const) {
    const sum = (list: readonly { salary: number }[]) =>
      list.reduce((s, x) => s + x.salary, 0);
    const incoming = sum(side.in);
    const outgoing = sum(side.out);
    const payrollAfter = side.payroll - outgoing + incoming;
    const size = side.size - side.out.length + side.in.length;
    if (size > 15) problems.push(`${name} would have more than 15 players`);
    if (input.inSeason && size < 12) {
      problems.push(`${name} would have fewer than 12 players`);
    }
    if (payrollAfter > input.ceiling) {
      problems.push(`${name} would be over the hard ceiling`);
    } else if (
      !salaryMatches({ payrollAfter, incoming, outgoing, cap: input.cap })
    ) {
      problems.push(
        `${name} would be over the cap and takes back too much salary`,
      );
    }
  }
  return problems;
}
