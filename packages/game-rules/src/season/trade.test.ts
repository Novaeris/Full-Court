import { describe, expect, it } from "vitest";
import {
  SALARY_CAP_BASE,
  STAR_MARGIN,
  TRADE_MARGIN,
  answerTrade,
  dealWords,
  minSalary,
  salaryMatches,
  tradeDeadlineDay,
  tradeProblems,
  tradeValue,
  type TradeAsset,
} from "../index";

const CAP = SALARY_CAP_BASE;

const player = (
  id: string,
  overall: number,
  extra: Partial<TradeAsset> = {},
): TradeAsset => ({
  id,
  position: "SF",
  age: 26,
  overall,
  potential: overall,
  salary: 5_000,
  yearsLeft: 2,
  ...extra,
});

describe("the trade deadline", () => {
  it("is two thirds of the way through the regular season", () => {
    expect(tradeDeadlineDay(85)).toBe(56);
    expect(tradeDeadlineDay(30)).toBe(20);
  });
});

describe("what a player is worth in a trade", () => {
  it("rises steeply with how good he is", () => {
    expect(tradeValue(player("a", 80), CAP)).toBeGreaterThan(
      tradeValue(player("b", 70), CAP) * 1.5,
    );
    expect(tradeValue(player("b", 70), CAP)).toBeGreaterThan(
      tradeValue(player("c", 55), CAP) * 3,
    );
    expect(tradeValue(player("z", 40), CAP)).toBe(0);
  });

  it("is higher for a bargain contract and lower for an overpaid player", () => {
    const fair = tradeValue(player("a", 72, { salary: 12_000 }), CAP);
    const cheap = tradeValue(player("a", 72, { salary: 3_000 }), CAP);
    const dear = tradeValue(player("a", 72, { salary: 30_000 }), CAP);
    expect(cheap).toBeGreaterThan(fair);
    expect(dear).toBeLessThan(fair);
  });

  it("falls with age for a veteran, and counts potential for the young", () => {
    expect(tradeValue(player("a", 74, { age: 34 }), CAP)).toBeLessThan(
      tradeValue(player("a", 74, { age: 27 }), CAP),
    );
    expect(
      tradeValue(player("a", 58, { age: 20, potential: 78 }), CAP),
    ).toBeGreaterThan(tradeValue(player("a", 58, { age: 28 }), CAP));
  });
});

describe("salary matching", () => {
  it("needs nothing for a team that ends under the cap", () => {
    expect(
      salaryMatches({
        payrollAfter: 110_000,
        incoming: 30_000,
        outgoing: 1_000,
        cap: CAP,
      }),
    ).toBe(true);
  });

  it("lets a team over the cap take back 125% plus the minimum", () => {
    const base = { payrollAfter: 140_000, cap: CAP, outgoing: 10_000 };
    expect(salaryMatches({ ...base, incoming: 12_500 + minSalary(CAP) })).toBe(
      true,
    );
    expect(
      salaryMatches({ ...base, incoming: 12_500 + minSalary(CAP) + 10 }),
    ).toBe(false);
  });
});

describe("how a computer team answers", () => {
  const team = [
    player("star1", 85),
    player("star2", 82),
    ...Array.from({ length: 11 }, (_, i) => player(`d${i}`, 55 + (i % 5))),
  ];
  const answer = (
    gives: TradeAsset[],
    receives: TradeAsset[],
    inSeason = true,
    roster = team,
  ) => answerTrade({ team: roster, gives, receives, cap: CAP, inSeason });

  it("accepts a trade that is worth more than the margin to it", () => {
    const gives = [team[5] as TradeAsset];
    const receives = [player("in", 75)];
    const verdict = answer(gives, receives);
    expect(verdict.receives).toBeGreaterThan(verdict.gives * TRADE_MARGIN);
    expect(verdict.accepts).toBe(true);
  });

  it("declines a trade that is not worth enough, and says so", () => {
    const verdict = answer([team[5] as TradeAsset], [player("in", 56)]);
    expect(verdict.accepts).toBe(false);
    expect(verdict.reasons).toContain("they want more in return");
  });

  it("protects its two best players", () => {
    const star = team[0] as TradeAsset;
    const tooLittle = answer([star], [player("in", 83)]);
    expect(tooLittle.accepts).toBe(false);
    expect(tooLittle.reasons.join()).toContain("best players");
    const plenty = answer([star], [player("a", 84), player("b", 84)], false);
    expect(plenty.receives).toBeGreaterThan(plenty.gives * STAR_MARGIN);
  });

  it("refuses a roster that would be too big or, in the season, too small", () => {
    const big = answer([], [player("in", 80)], true, [
      ...team,
      player("e1", 50),
      player("e2", 50),
    ]);
    expect(big.reasons).toContain("their roster would be too big");
    const small = answer(
      [team[5] as TradeAsset, team[6] as TradeAsset, team[7] as TradeAsset],
      [player("in", 90)],
      true,
      team.slice(0, 13),
    );
    expect(small.reasons).toContain("their roster would be too small");
    expect(
      answer(
        [team[5] as TradeAsset, team[6] as TradeAsset, team[7] as TradeAsset],
        [player("in", 90)],
        false,
        team.slice(0, 13),
      ).reasons,
    ).not.toContain("their roster would be too small");
  });

  it("values a position it is short of a little more", () => {
    const needy = [
      player("a", 70, { position: "PG" }),
      ...Array.from({ length: 12 }, (_, i) => player(`s${i}`, 60)),
    ];
    const asset = player("in", 66, { position: "C" });
    const inNeed = answer([], [asset], true, needy).receives;
    const noNeed = answer(
      [],
      [{ ...asset, position: "SF" }],
      true,
      needy,
    ).receives;
    expect(inNeed).toBeGreaterThan(noNeed);
  });
});

describe("a deal in words", () => {
  it("rates how it looks to the computer team", () => {
    expect(dealWords(100, 100)).toBe("close");
    expect(dealWords(50, 100)).toBe("not enough");
    expect(dealWords(120, 100)).toBe("good for them");
    expect(dealWords(200, 100)).toBe("very generous");
  });
});

describe("whether a trade is legal", () => {
  const side = (
    payroll: number,
    size: number,
    out: number[],
    inn: number[],
  ) => ({
    payroll,
    size,
    out: out.map((salary) => ({ salary })),
    in: inn.map((salary) => ({ salary })),
  });
  const check = (
    a: ReturnType<typeof side>,
    b: ReturnType<typeof side>,
    inSeason = true,
  ) =>
    tradeProblems({ a, b, cap: CAP, ceiling: Math.round(CAP * 1.2), inSeason });

  it("passes a balanced trade between two teams under the cap", () => {
    expect(
      check(
        side(100_000, 14, [8_000], [8_000]),
        side(100_000, 14, [8_000], [8_000]),
      ),
    ).toEqual([]);
  });

  it("refuses an empty trade", () => {
    expect(
      check(side(100_000, 14, [], []), side(100_000, 14, [], [])),
    ).toHaveLength(1);
  });

  it("refuses rosters outside the limits", () => {
    expect(
      check(
        side(100_000, 15, [], [5_000]),
        side(100_000, 14, [5_000], []),
      ).join(),
    ).toContain("more than 15");
    expect(
      check(
        side(100_000, 12, [5_000], []),
        side(100_000, 14, [], [5_000]),
      ).join(),
    ).toContain("fewer than 12");
    expect(
      check(
        side(100_000, 12, [5_000], []),
        side(100_000, 14, [], [5_000]),
        false,
      ),
    ).toEqual([]);
  });

  it("refuses a team that would pass the hard ceiling or break salary matching", () => {
    expect(
      check(
        side(135_000, 14, [1_000], [12_000]),
        side(100_000, 14, [12_000], [1_000]),
      ).join(),
    ).toContain("over the cap");
    expect(
      check(
        side(145_000, 14, [1_000], [10_000]),
        side(100_000, 14, [10_000], [1_000]),
      ).join(),
    ).toContain("hard ceiling");
  });
});
