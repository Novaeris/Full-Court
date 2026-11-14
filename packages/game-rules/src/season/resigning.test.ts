import { describe, expect, it } from "vitest";
import { maxSalary, minSalary } from "./finance";
import {
  KEEP_BEST,
  MOST_OVER_ASK,
  resignOffer,
  resignTeam,
  wantsBack,
  type ExpiringPlayer,
} from "./resigning";

const CAP = 100_000;

const player = (over: Partial<ExpiringPlayer> = {}): ExpiringPlayer => ({
  id: "p",
  age: 27,
  overall: 70,
  potential: 72,
  salary: 10_000,
  rank: 3,
  ask: 20_000,
  askYears: 3,
  maxYears: 5,
  minimum: 19_000,
  ...over,
});

describe("who a team wants back", () => {
  it("keeps its best players", () => {
    expect(wantsBack(player({ rank: 1 }))).toBe(true);
    expect(wantsBack(player({ rank: KEEP_BEST }))).toBe(true);
    expect(wantsBack(player({ rank: KEEP_BEST + 1 }))).toBe(false);
  });

  it("lets older players go unless they are among the best", () => {
    expect(wantsBack(player({ age: 33, rank: 4 }))).toBe(true);
    expect(wantsBack(player({ age: 33, rank: 6 }))).toBe(false);
    expect(wantsBack(player({ age: 35, rank: 1 }))).toBe(false);
  });

  it("keeps a promising youngster a little further down", () => {
    const young = { age: 21, overall: 55, potential: 70, rank: 10 };
    expect(wantsBack(player(young))).toBe(true);
    expect(wantsBack(player({ ...young, potential: 58 }))).toBe(false);
    expect(wantsBack(player({ ...young, rank: 12 }))).toBe(false);
  });
});

describe("the offer", () => {
  it("is the least he signs for, for a longer contract than his old one", () => {
    expect(resignOffer(player(), CAP)).toEqual({
      id: "p",
      salary: 19_000,
      years: 3,
    });
  });

  it("is never for one year, which would end no later than his old contract", () => {
    expect(resignOffer(player({ askYears: 1 }), CAP)?.years).toBe(2);
    expect(resignOffer(player({ maxYears: 1 }), CAP)).toBeNull();
  });

  it("stays inside what a contract can be", () => {
    expect(resignOffer(player({ minimum: 1 }), CAP)?.salary).toBe(
      minSalary(CAP),
    );
    const star = player({ ask: maxSalary(CAP), minimum: maxSalary(CAP) * 1.1 });
    expect(resignOffer(star, CAP)?.salary).toBe(maxSalary(CAP));
  });

  it("isn't made to a player who thinks too little of the team", () => {
    const cold = player({ minimum: Math.ceil(20_000 * MOST_OVER_ASK) + 10 });
    expect(resignOffer(cold, CAP)).toBeNull();
    expect(resignOffer(player({ minimum: Infinity }), CAP)).toBeNull();
  });
});

describe("a team's re-signings", () => {
  const roster = [1, 2, 3, 4].map((rank) =>
    player({ id: `p${rank}`, rank, salary: 10_000 }),
  );

  it("re-signs everyone it wants while the payroll allows", () => {
    expect(resignTeam(roster, 100_000, 200_000, CAP)).toHaveLength(4);
  });

  it("stops paying raises once the limit is reached, best players first", () => {
    // Each raise is 9,000: only two fit under the limit.
    const offers = resignTeam(roster, 100_000, 118_000, CAP);
    expect(offers.map((o) => o.id)).toEqual(["p1", "p2"]);
  });

  it("still re-signs a player at less than he earns now", () => {
    const cheaper = [
      player({ id: "a", salary: 30_000, minimum: 15_000, ask: 16_000 }),
    ];
    expect(resignTeam(cheaper, 500_000, 100_000, CAP)).toHaveLength(1);
  });

  it("is the same whatever order the players come in", () => {
    expect(resignTeam([...roster].reverse(), 100_000, 118_000, CAP)).toEqual(
      resignTeam(roster, 100_000, 118_000, CAP),
    );
  });
});
