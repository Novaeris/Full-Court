import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import { MIN_HEALTHY, injuryDetails, sitOut } from "./injuries";

describe("injuryDetails", () => {
  const many = (seed: string, n: number) => {
    const rng = createRng(seedState(seed));
    return Array.from({ length: n }, () => injuryDetails(rng));
  };

  it("is the same for the same seed", () => {
    expect(many("a", 50)).toEqual(many("a", 50));
    expect(many("a", 50)).not.toEqual(many("b", 50));
  });

  it("uses three draws each time, whatever it picks", () => {
    const one = createRng(seedState("draws"));
    const two = createRng(seedState("draws"));
    for (let i = 0; i < 100; i++) injuryDetails(one);
    for (let i = 0; i < 300; i++) two.next();
    expect(one.state()).toEqual(two.state());
  });

  it("gives lengths in each severity's range, mostly short", () => {
    const list = many("len", 20_000);
    const by = (s: string) => list.filter((i) => i.severity === s);
    expect(by("minor").length).toBeGreaterThan(by("moderate").length);
    expect(by("moderate").length).toBeGreaterThan(by("major").length);
    const share = (s: string) => by(s).length / list.length;
    expect(share("minor")).toBeGreaterThan(0.69);
    expect(share("minor")).toBeLessThan(0.75);
    expect(share("major")).toBeGreaterThan(0.03);
    expect(share("major")).toBeLessThan(0.07);
    for (const i of by("minor")) {
      expect(i.days).toBeGreaterThanOrEqual(1);
      expect(i.days).toBeLessThanOrEqual(5);
    }
    for (const i of by("moderate")) {
      expect(i.days).toBeGreaterThanOrEqual(6);
      expect(i.days).toBeLessThanOrEqual(20);
    }
    for (const i of by("major")) {
      expect(i.days).toBeGreaterThanOrEqual(21);
      expect(i.days).toBeLessThanOrEqual(80);
    }
    for (const i of list) expect(i.kind.length).toBeGreaterThan(0);
    const minors = by("minor");
    const short = minors.filter((i) => i.days <= 2).length;
    expect(short).toBeGreaterThan(minors.length / 2);
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
