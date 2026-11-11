import { invariant } from "@fullcourt/shared";
import type { Rng } from "./rng";

/** Picks one item uniformly. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  invariant(items.length > 0, "pick needs at least one item");
  return items[rng.int(0, items.length - 1)] as T;
}

/** A shuffled copy (Fisher–Yates). The input is not changed. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Normally distributed value (Box–Muller). Always draws exactly two numbers. */
export function normal(rng: Rng, mean: number, sd: number): number {
  const u1 = 1 - rng.next(); // (0, 1], so log is finite
  const u2 = rng.next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

/** Picks by weight; weights need not sum to 1. */
export function weighted<T>(
  rng: Rng,
  options: readonly (readonly [T, number])[],
): T {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  invariant(total > 0, "weighted needs a positive total weight");
  let roll = rng.next() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return (options[options.length - 1] as readonly [T, number])[0];
}
