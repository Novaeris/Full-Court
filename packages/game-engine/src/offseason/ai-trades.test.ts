import { describe, expect, it } from "vitest";
import { SALARY_CAP_BASE, type TradeAsset } from "@fullcourt/game-rules";
import { createRng, seedState } from "../rng/rng";
import {
  proposeAiTrades,
  proposeOwnerOffers,
  type AiTradeTeam,
} from "./ai-trades";

const CAP = SALARY_CAP_BASE;
const POS = ["PG", "SG", "SF", "PF", "C"];

const asset = (id: string, overall: number, position: string): TradeAsset => ({
  id,
  position,
  age: 26,
  overall,
  potential: overall,
  salary: 5_000,
  yearsLeft: 2,
});

/** A team with 13 players; `lack` is a position it has only one of. */
function team(id: string, lack: string, extra: string): AiTradeTeam {
  const roster: TradeAsset[] = [];
  for (let i = 0; i < 13; i++) {
    let position = POS[i % 5] as string;
    if (position === lack) position = extra;
    roster.push(asset(`${id}-${i}`, 70 - i * 2, position));
  }
  roster[4] = asset(`${id}-4`, 60, lack);
  return { id, payroll: 80_000, roster };
}

const teams = [
  team("a", "C", "PG"),
  team("b", "PG", "C"),
  team("c", "SF", "SG"),
];
const run = (seed: string, most = 3) =>
  proposeAiTrades(createRng(seedState(seed)), {
    teams,
    cap: CAP,
    inSeason: false,
    most,
  });

describe("proposeAiTrades", () => {
  it("is the same for the same seed", () => {
    expect(run("x")).toEqual(run("x"));
  });

  it("uses a team and a player at most once, and respects the limit", () => {
    const trades = run("y", 1);
    expect(trades.length).toBeLessThanOrEqual(1);
    const all = run("z");
    const ids = all.flatMap((t) => [t.teamA, t.teamB]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never gives up a team's two best players", () => {
    for (const seed of ["1", "2", "3", "4", "5"]) {
      for (const t of run(seed)) {
        for (const id of [...t.fromA, ...t.fromB]) {
          expect(id.endsWith("-0") || id.endsWith("-1")).toBe(false);
        }
      }
    }
  });

  it("makes no trade between identical teams", () => {
    const same = [team("p", "C", "PG"), team("q", "C", "PG")];
    const out = proposeAiTrades(createRng(seedState("s")), {
      teams: same,
      cap: CAP,
      inSeason: true,
      most: 3,
    });
    expect(out).toEqual([]);
  });
});

describe("proposeOwnerOffers", () => {
  const owner = team("me", "C", "PG");
  const make = (seed: string, most = 2) =>
    proposeOwnerOffers(createRng(seedState(seed)), {
      owner: { payroll: owner.payroll, roster: owner.roster },
      teams,
      cap: CAP,
      inSeason: false,
      most,
    });

  it("is the same for the same seed", () => {
    expect(make("o")).toEqual(make("o"));
  });

  it("offers something for one of the owner's players, from different teams", () => {
    for (const seed of ["1", "2", "3", "4", "5", "6"]) {
      const offers = make(seed);
      expect(offers.length).toBeLessThanOrEqual(2);
      const partners = offers.map((o) => o.partnerId);
      expect(new Set(partners).size).toBe(partners.length);
      for (const o of offers) {
        expect(o.give).toHaveLength(1);
        expect(o.get.length).toBeGreaterThan(0);
        expect(owner.roster.some((p) => p.id === o.give[0])).toBe(true);
      }
    }
  });

  it("does make offers", () => {
    const total = ["1", "2", "3", "4", "5", "6"].reduce(
      (n, seed) => n + make(seed).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });

  it("offers nothing when no team can take the player", () => {
    expect(make("x", 0)).toEqual([]);
  });
});

describe("picks in trades", () => {
  const picks = (id: string) => [
    { id: `${id}-p1`, value: 40 },
    { id: `${id}-p2`, value: 150 },
    { id: `${id}-p3`, value: 600 },
  ];
  // The same teams, but b is a little weaker, so a swap with b needs a sweetener.
  const rich = [
    { ...team("a", "C", "PG"), picks: picks("a") },
    {
      ...team("b", "PG", "C"),
      roster: team("b", "PG", "C").roster.map((p) => ({
        ...p,
        overall: p.overall + 3,
        potential: p.potential + 3,
      })),
      picks: picks("b"),
    },
    { ...team("c", "SF", "SG"), picks: picks("c") },
  ];
  const ask = (seed: string) =>
    proposeAiTrades(createRng(seedState(seed)), {
      teams: rich,
      cap: CAP,
      inSeason: false,
      most: 3,
    });
  const seeds = Array.from({ length: 40 }, (_, i) => `p${i}`);

  it("only trades picks the giving team holds, one at a time", () => {
    for (const seed of seeds) {
      for (const t of ask(seed)) {
        expect(t.picksA.length + t.picksB.length).toBeLessThanOrEqual(1);
        for (const id of t.picksA)
          expect(id.startsWith(`${t.teamA}-`)).toBe(true);
        for (const id of t.picksB)
          expect(id.startsWith(`${t.teamB}-`)).toBe(true);
      }
    }
  });

  it("makes some trades only a pick makes possible", () => {
    const withPicks = seeds
      .flatMap(ask)
      .filter((t) => t.picksA.length + t.picksB.length > 0);
    expect(withPicks.length).toBeGreaterThan(0);
  });

  it("is the same for the same seed", () => {
    expect(ask("q")).toEqual(ask("q"));
  });
});

describe("owner offers with picks", () => {
  it("may add a pick to a package", () => {
    const owner = team("me", "C", "PG");
    const rich = teams.map((t) => ({
      ...t,
      picks: [{ id: `${t.id}-pick`, value: 120 }],
    }));
    const offers = ["1", "2", "3", "4", "5", "6", "7", "8"].flatMap((seed) =>
      proposeOwnerOffers(createRng(seedState(seed)), {
        owner: { payroll: owner.payroll, roster: owner.roster },
        teams: rich,
        cap: CAP,
        inSeason: false,
        most: 2,
      }),
    );
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      for (const id of o.getPicks) expect(id).toBe(`${o.partnerId}-pick`);
    }
    expect(offers.some((o) => o.getPicks.length > 0)).toBe(true);
  });
});
