import { describe, expect, it } from "vitest";
import { SALARY_CAP_BASE, type TradeAsset } from "@fullcourt/game-rules";
import { createRng, seedState } from "../rng/rng";
import { proposeAiTrades, type AiTradeTeam } from "./ai-trades";

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
