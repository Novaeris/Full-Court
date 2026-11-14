import { describe, expect, it } from "vitest";
import {
  ROSTER_LIMITS,
  SALARY_CAP_BASE,
  hardCeiling,
  minSalary,
} from "@fullcourt/game-rules";
import { createRng, seedState } from "../rng/rng";
import { generateWorld } from "../world/generate";
import type { OffseasonPlayer } from "./offseason";
import {
  fillRosters,
  getsNewContract,
  payrollOf,
  shedPayroll,
} from "./rosters";

const CAP = SALARY_CAP_BASE;
const CEILING = hardCeiling(CAP);
const MIN = minSalary(CAP);

/**
 * One team of nine expensive players, right under the hard ceiling (room for
 * only two minimum contracts, and it needs three to reach 12), the rest of
 * the league's players free agents.
 */
function setup() {
  const world = generateWorld({ seed: "shed-then-fill", size: "compact" });
  const all: OffseasonPlayer[] = world.players.map((p, i) => ({
    id: `p${i}`,
    teamId: null,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position,
    age: p.age,
    jersey: p.jersey,
    ratings: p.ratings,
    overall: p.overall,
    potential: p.potential,
  }));
  const team = "T-FULL";
  const roster = all.slice(0, 9).map((p) => ({ ...p, teamId: team }));
  const players = [...roster, ...all.slice(9)];
  const each = (CEILING - 2 * MIN) / 9;
  const salaries = new Map<string, number>(roster.map((p) => [p.id, each]));
  return { team, players, salaries, payroll: payrollOf(players, salaries) };
}

const size = (players: readonly OffseasonPlayer[], team: string) =>
  players.filter((p) => p.teamId === team).length;

describe("a team too close to the ceiling to fill its roster", () => {
  it("starts with room for fewer minimum contracts than it needs", () => {
    const { team, payroll } = setup();
    const room = CEILING - (payroll.get(team) ?? 0);
    expect(Math.floor(room / MIN)).toBe(2);
    expect(ROSTER_LIMITS.min - 9).toBe(3);
  });

  it("lets its best-paid players go, and then reaches the minimum", () => {
    const { team, players, salaries, payroll } = setup();
    const shed = shedPayroll(players, salaries, payroll, new Set([team]), CAP);
    expect(size(shed, team)).toBeLessThan(9);
    // The payroll after the release is the one to fill with.
    const after = payrollOf(shed, salaries);
    expect(after.get(team) ?? 0).toBeLessThan(payroll.get(team) ?? 0);
    const moves = fillRosters(createRng(seedState("fill")), {
      teams: [team],
      players: shed,
      acting: new Set([team]),
      cap: CAP,
      payroll: after,
    });
    const signed = moves.filter((m) => m.teamId === team).length;
    expect(size(shed, team) + signed).toBeGreaterThanOrEqual(ROSTER_LIMITS.min);
  });

  it("is left short if the fill is given the payroll from before the release", () => {
    // The bug this guards against: shedding players but filling with the old
    // payroll, which still says the team is at the ceiling.
    const { team, players, salaries, payroll } = setup();
    const shed = shedPayroll(players, salaries, payroll, new Set([team]), CAP);
    const moves = fillRosters(createRng(seedState("fill")), {
      teams: [team],
      players: shed,
      acting: new Set([team]),
      cap: CAP,
      payroll,
    });
    const signed = moves.filter((m) => m.teamId === team).length;
    expect(size(shed, team) + signed).toBeLessThan(ROSTER_LIMITS.min);
  });

  it("leaves a team with room alone", () => {
    const { team, players, salaries } = setup();
    const cheap = new Map([...salaries].map(([id]) => [id, MIN]));
    const same = shedPayroll(
      players,
      cheap,
      payrollOf(players, cheap),
      new Set([team]),
      CAP,
    );
    expect(size(same, team)).toBe(9);
  });
});

describe("what is saved after a team lets players go and then fills its roster", () => {
  /**
   * The payroll the database ends up with, the way the server saves a result:
   * a player who stays on the team he was on keeps his contract, and anyone
   * else who joins signs a minimum one.
   */
  function saved(
    original: readonly OffseasonPlayer[],
    final: ReadonlyMap<string, string | null>,
    salaries: ReadonlyMap<string, number>,
    team: string,
  ): number {
    let total = 0;
    for (const p of original) {
      if (final.get(p.id) !== team) continue;
      total += p.teamId === team ? (salaries.get(p.id) ?? 0) : MIN;
    }
    return total;
  }

  /**
   * Like a real case: nine players, one of them the best in the league on a
   * maximum contract, and room under the ceiling for only two minimum
   * contracts. The star is the first to go, and the best player left to sign.
   */
  function starSetup() {
    const base = setup();
    const best = [...base.players].sort((a, b) => b.overall - a.overall)[0]!;
    const rest = base.players
      .filter((p) => p.id !== best.id)
      .sort((a, b) => a.overall - b.overall);
    const team = "T-STAR";
    const roster = [best, ...rest.slice(100, 108)].map((p) => ({
      ...p,
      teamId: team,
    }));
    const ids = new Set(roster.map((p) => p.id));
    const players = [...roster, ...base.players.filter((p) => !ids.has(p.id))];
    const star = Math.round(CAP * 0.3);
    const others = Math.floor((CEILING - 2 * MIN - star) / 8);
    const salaries = new Map<string, number>(
      roster.map((p) => [p.id, p.id === best.id ? star : others]),
    );
    return { team, players, salaries, payroll: payrollOf(players, salaries) };
  }

  function run(seed: number, withReleased: boolean) {
    const { team, players, salaries, payroll } = starSetup();
    const shed = shedPayroll(players, salaries, payroll, new Set([team]), CAP);
    const released = new Map(
      players
        .filter((p) => p.teamId === team)
        .filter((p) => shed.find((s) => s.id === p.id)?.teamId === null)
        .map((p) => [p.id, team] as const),
    );
    const moves = fillRosters(createRng(seedState(`s${seed}`)), {
      teams: [team],
      players: shed,
      acting: new Set([team]),
      cap: CAP,
      payroll: payrollOf(shed, salaries),
      ...(withReleased ? { released } : {}),
    });
    const final = new Map<string, string | null>(
      shed.map((p) => [p.id, p.teamId]),
    );
    for (const m of moves) final.set(m.id, m.teamId);
    return {
      team,
      released,
      final,
      total: saved(players, final, salaries, team),
    };
  }

  it("never takes the team past the hard ceiling, whatever the draw", () => {
    for (let seed = 0; seed < 80; seed++) {
      const r = run(seed, true);
      expect(r.total, `seed ${seed}`).toBeLessThanOrEqual(CEILING);
    }
  });

  it("does not sign back a player the team just let go", () => {
    for (let seed = 0; seed < 80; seed++) {
      const r = run(seed, true);
      for (const id of r.released.keys()) {
        expect(r.final.get(id), `seed ${seed}`).not.toBe(r.team);
      }
    }
  });

  it("went past the ceiling before: a released star came back and kept his contract", () => {
    let over = 0;
    for (let seed = 0; seed < 80; seed++) {
      if (run(seed, false).total > CEILING) over += 1;
    }
    expect(over).toBeGreaterThan(0);
  });
});

describe("getsNewContract", () => {
  it("is for a free agent who signs", () => {
    expect(getsNewContract("T", null, true)).toBe(true);
  });

  it("is for someone let go and signed again by the same team", () => {
    expect(getsNewContract("T", null, true)).toBe(true);
    expect(getsNewContract("T", null, false)).toBe(true);
  });

  it("is for someone another team cut, signed by a different one", () => {
    // He was on a team when the fill began (so not a free agent), and the fill
    // signed him: he gets the minimum contract, not the one he had.
    expect(getsNewContract("Y", "X", true)).toBe(true);
  });

  it("is not for a player who just stays, or who is not on a team", () => {
    expect(getsNewContract("T", "T", false)).toBe(false);
    expect(getsNewContract(null, null, false)).toBe(false);
    expect(getsNewContract(null, "T", false)).toBe(false);
  });
});
