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
import { fillRosters, payrollOf, shedPayroll } from "./rosters";

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
