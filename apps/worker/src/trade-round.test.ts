import { describe, expect, it } from "vitest";
import { SALARY_CAP_BASE, type TradeAsset } from "@fullcourt/game-rules";
import {
  isTradeDay,
  runTradeRound,
  type TradeStore,
  type TradeTeam,
} from "./trade-round";

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
function team(id: string, lack: string, extra: string): TradeTeam {
  const roster = Array.from({ length: 13 }, (_, i) => {
    const p = POS[i % 5] as string;
    return asset(`${id}-${i}`, 70 - i * 2, p === lack ? extra : p);
  });
  roster[4] = asset(`${id}-4`, 60, lack);
  return { id, payroll: 80_000, roster };
}
const season = {
  id: "s",
  league_id: "l",
  year: 2026,
  day: 10,
  salary_cap: SALARY_CAP_BASE,
};

describe("isTradeDay", () => {
  it("is every fifth day up to the deadline", () => {
    expect(isTradeDay(5, 60)).toBe(true);
    expect(isTradeDay(7, 60)).toBe(false);
    expect(isTradeDay(40, 60)).toBe(true);
    expect(isTradeDay(45, 60)).toBe(false);
    expect(isTradeDay(0, 60)).toBe(false);
  });
});

describe("runTradeRound", () => {
  const teams = [
    team("a", "C", "PG"),
    team("b", "PG", "C"),
    team("c", "SF", "SG"),
  ];

  it("applies what the engine proposes, the same way each time", async () => {
    const run = async () => {
      const applied: string[] = [];
      const store: TradeStore = {
        loadTradeTeams: async () => teams,
        applyTrade: async (_s, t) => {
          applied.push(`${t.teamA}:${t.fromA}>${t.teamB}:${t.fromB}`);
        },
      };
      await runTradeRound(store, season);
      return applied;
    };
    expect(await run()).toEqual(await run());
  });

  it("skips a trade the database refuses", async () => {
    const store: TradeStore = {
      loadTradeTeams: async () => teams,
      applyTrade: async () => {
        throw new Error("over_ceiling");
      },
    };
    expect(await runTradeRound(store, season)).toBe(0);
  });
});
