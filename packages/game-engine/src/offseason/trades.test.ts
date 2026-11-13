import { describe, expect, it } from "vitest";
import {
  SALARY_CAP_BASE,
  hardCeiling,
  tradeProblems,
  tradeValue,
  type TradeAsset,
} from "@fullcourt/game-rules";
import { shopPlayers, type ShopTeam } from "./trades";

const CAP = SALARY_CAP_BASE;

const asset = (
  id: string,
  overall: number,
  salary = 5_000,
  position = "SF",
): TradeAsset => ({
  id,
  position,
  age: 26,
  overall,
  potential: overall,
  salary,
  yearsLeft: 2,
});

function team(id: string, base: number, payroll = 100_000): ShopTeam {
  return {
    id,
    payroll,
    roster: Array.from({ length: 13 }, (_, i) =>
      asset(
        `${id}-${i}`,
        base - i * 2,
        5_000,
        ["PG", "SG", "SF", "PF", "C"][i % 5],
      ),
    ),
  };
}

describe("shopping a player", () => {
  const owner = {
    payroll: 100_000,
    roster: Array.from({ length: 13 }, (_, i) => asset(`me-${i}`, 70 - i * 2)),
  };
  const star = asset("star", 82, 20_000);

  it("finds packages the computer teams would accept and that are legal for both", () => {
    const teams = [team("A", 72), team("B", 68), team("C", 60)];
    const offers = shopPlayers({
      assets: [star],
      teams,
      owner,
      cap: CAP,
      inSeason: true,
    });
    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      const they = teams.find((t) => t.id === offer.teamId)!;
      expect(offer.receives).toBeGreaterThanOrEqual(offer.gives * 1.08);
      expect(
        tradeProblems({
          a: {
            payroll: owner.payroll,
            size: owner.roster.length,
            out: [star],
            in: offer.get,
          },
          b: {
            payroll: they.payroll,
            size: they.roster.length,
            out: offer.get,
            in: [star],
          },
          cap: CAP,
          ceiling: hardCeiling(CAP),
          inSeason: true,
        }),
      ).toEqual([]);
    }
  });

  it("offers the best first, never one of a team's two best players, and at most five", () => {
    const teams = Array.from({ length: 8 }, (_, i) => team(`T${i}`, 70 + i));
    const offers = shopPlayers({
      assets: [star],
      teams,
      owner,
      cap: CAP,
      inSeason: true,
    });
    expect(offers.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < offers.length; i++) {
      expect(offers[i - 1]!.worth).toBeGreaterThanOrEqual(offers[i]!.worth);
    }
    for (const offer of offers) {
      const they = teams.find((t) => t.id === offer.teamId)!;
      const top2 = [...they.roster]
        .sort((a, b) => tradeValue(b, CAP) - tradeValue(a, CAP))
        .slice(0, 2)
        .map((a) => a.id);
      for (const got of offer.get) expect(top2).not.toContain(got.id);
    }
  });

  it("finds nothing when the player is worth little", () => {
    const offers = shopPlayers({
      assets: [asset("scrub", 45)],
      teams: [team("A", 72)],
      owner,
      cap: CAP,
      inSeason: true,
    });
    expect(offers).toEqual([]);
  });

  it("does not offer a package that would take the owner's roster over 15", () => {
    const full = {
      payroll: 100_000,
      roster: Array.from({ length: 15 }, (_, i) =>
        asset(`me-${i}`, 70 - i * 2),
      ),
    };
    const offers = shopPlayers({
      assets: [star],
      teams: [team("A", 72), team("B", 70)],
      owner: full,
      cap: CAP,
      inSeason: true,
    });
    for (const offer of offers) expect(offer.get.length).toBe(1);
  });
});
