import { describe, expect, it } from "vitest";
import { createRng, seedState } from "./rng";

const draw = (seed: string, n: number) => {
  const rng = createRng(seedState(seed));
  return Array.from({ length: n }, () => rng.next());
};

describe("seeded rng", () => {
  it("is deterministic for the same seed", () => {
    expect(JSON.stringify(draw("league-1", 1000))).toBe(
      JSON.stringify(draw("league-1", 1000)),
    );
  });

  it("differs between seeds", () => {
    expect(draw("league-1", 5)).not.toEqual(draw("league-2", 5));
  });

  it("matches a pinned sequence, so results stay stable across platforms and releases", () => {
    const rng = createRng(seedState("full-court"));
    const values = Array.from({ length: 4 }, () => rng.int(1, 100));
    expect(values).toMatchInlineSnapshot(`
      [
        12,
        38,
        13,
        21,
      ]
    `);
  });

  it("resumes exactly from a saved state", () => {
    const rng = createRng(seedState("resume"));
    rng.next();
    rng.next();
    const saved = JSON.parse(JSON.stringify(rng.state()));
    const expected = [rng.next(), rng.next(), rng.next()];
    const resumed = createRng(saved);
    expect([resumed.next(), resumed.next(), resumed.next()]).toEqual(expected);
  });

  it("keeps values in range", () => {
    const rng = createRng(seedState("range"));
    for (let i = 0; i < 10_000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(-3, 3);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it("rejects bad bounds", () => {
    const rng = createRng(seedState("bounds"));
    expect(() => rng.int(5, 1)).toThrow();
    expect(() => rng.int(0.5, 1)).toThrow();
  });
});
