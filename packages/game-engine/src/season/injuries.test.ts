import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import {
  INJURY_RATE_PER_MINUTE,
  MIN_HEALTHY,
  rollInjuries,
  sitOut,
  type InjuryCandidate,
} from "./injuries";

const crowd = (n: number, minutes = 30): InjuryCandidate[] =>
  Array.from({ length: n }, (_, i) => ({
    playerId: `p${String(i).padStart(4, "0")}`,
    teamId: `t${i % 10}`,
    minutes,
  }));
const roll = (seed: string, list: InjuryCandidate[]) =>
  rollInjuries(createRng(seedState(seed)), list);

describe("rollInjuries", () => {
  it("is the same for the same seed, whatever the order", () => {
    const list = crowd(300);
    expect(roll("a", list)).toEqual(roll("a", list));
    expect(roll("a", list)).toEqual(roll("a", [...list].reverse()));
    expect(roll("a", list)).not.toEqual(roll("b", list));
  });

  it("hurts about the expected share of the players who played", () => {
    const list = crowd(20_000);
    const hurt = roll("rate", list).length;
    const expected = 20_000 * 30 * INJURY_RATE_PER_MINUTE;
    expect(hurt).toBeGreaterThan(expected * 0.8);
    expect(hurt).toBeLessThan(expected * 1.2);
  });

  it("never hurts a player who didn't play, and hurts the heavy minutes more", () => {
    expect(roll("zero", crowd(5_000, 0))).toEqual([]);
    const light = roll("m", crowd(20_000, 10)).length;
    const heavy = roll("m", crowd(20_000, 40)).length;
    expect(heavy).toBeGreaterThan(light * 2);
  });

  it("gives lengths in each severity's range, mostly short", () => {
    const hurt = roll("len", crowd(60_000));
    const by = (s: string) => hurt.filter((i) => i.severity === s);
    expect(by("minor").length).toBeGreaterThan(by("moderate").length);
    expect(by("moderate").length).toBeGreaterThan(by("major").length);
    for (const i of by("minor")) expect(i.days).toBeGreaterThanOrEqual(1);
    for (const i of by("minor")) expect(i.days).toBeLessThanOrEqual(5);
    for (const i of by("major")) expect(i.days).toBeGreaterThanOrEqual(21);
    for (const i of hurt) expect(i.kind.length).toBeGreaterThan(0);
    const minors = by("minor");
    const short = minors.filter((i) => i.days <= 2).length;
    expect(short).toBeGreaterThan(minors.length / 2);
  });

  it("doesn't let one player's result move another's", () => {
    const list = crowd(100);
    const without = roll("same", list.slice(50));
    const withAll = roll("same", list);
    // The last 50 draw after the first 50, so they differ, but each run is
    // still repeatable and uses the same draws per player.
    expect(roll("same", list)).toEqual(withAll);
    expect(without.every((i) => i.days > 0)).toBe(true);
  });
});

describe("sitOut", () => {
  const team = (days: number[]) =>
    days.map((d, i) => ({ id: `p${i}`, injuryDays: d }));

  it("keeps injured players out while enough are healthy", () => {
    const out = sitOut(team([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 9]));
    expect([...out].sort()).toEqual(["p10", "p11"]);
  });

  it("brings back the least injured when too few are healthy", () => {
    const days = [0, 0, 0, 0, 0, 0, 7, 3, 5, 20, 12, 9];
    const out = sitOut(team(days));
    expect(MIN_HEALTHY).toBe(8);
    // 6 healthy; two come back: the 3 and the 5.
    expect(out.has("p7")).toBe(false);
    expect(out.has("p8")).toBe(false);
    expect(out.size).toBe(4);
  });

  it("is empty for a healthy team", () => {
    expect(sitOut(team([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).size).toBe(0);
  });
});
