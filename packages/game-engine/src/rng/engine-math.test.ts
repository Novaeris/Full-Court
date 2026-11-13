import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cos, pow15, sin } from "./dmath";
import { normalSum } from "./helpers";
import { createRng, seedState } from "./rng";

describe("exact math", () => {
  it("sin and cos match the platform's to 1e-13 over the angles the engine uses", () => {
    for (let i = 0; i <= 3200; i++) {
      const x = (i / 3200) * Math.PI;
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-13);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-13);
    }
    expect(sin(0)).toBe(0);
    expect(cos(0)).toBe(1);
  });

  it("pow15 is x to the power 1.5", () => {
    for (const x of [0, 0.25, 1, 4, 9, 20.5, 99]) {
      expect(Math.abs(pow15(x) - x ** 1.5)).toBeLessThan(
        1e-12 * (1 + x ** 1.5),
      );
    }
    expect(pow15(4)).toBe(8);
  });

  it("normalSum is roughly normal, bounded and draws twelve numbers", () => {
    const rng = createRng(seedState("normal-sum"));
    const before = [...rng.state()];
    normalSum(rng, 0, 1);
    const after = createRng(before as never);
    for (let i = 0; i < 12; i++) after.next();
    expect(rng.state()).toEqual(after.state());

    const values = Array.from({ length: 50000 }, () => normalSum(rng, 15, 3));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    expect(Math.abs(mean - 15)).toBeLessThan(0.05);
    expect(Math.abs(Math.sqrt(variance) - 3)).toBeLessThan(0.05);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(15 - 6 * 3);
    expect(Math.max(...values)).toBeLessThanOrEqual(15 + 6 * 3);
  });
});

/**
 * The simulation must give identical results on every JavaScript engine, so it
 * may only use arithmetic every engine computes the same way (see dmath.ts).
 */
describe("the simulation's arithmetic", () => {
  const dir = join(__dirname, "..", "season");
  const files = readdirSync(dir).filter(
    (f) =>
      f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "test-league.ts",
  );
  const withoutComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("covers the simulation files", () => {
    expect(files).toEqual(
      expect.arrayContaining(["game.ts", "day.ts", "replay.ts", "schedule.ts"]),
    );
  });

  it.each(files)(
    "%s uses no platform maths that can differ between engines",
    (file) => {
      const source = withoutComments(readFileSync(join(dir, file), "utf8"));
      const banned = source.match(
        /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/g,
      );
      expect(banned, `${file} uses ${banned?.join(", ")}`).toBeNull();
      expect(source, `${file} uses the ** operator`).not.toMatch(/\*\*/);
      expect(source, `${file} imports the Box-Muller normal`).not.toMatch(
        /import\s*\{[^}]*\bnormal\b[^}]*\}\s*from\s*"\.\.\/rng\/helpers"/,
      );
    },
  );
});
