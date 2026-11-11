import { invariant } from "@fullcourt/shared";

/**
 * Seeded pseudo-random number generator (sfc32).
 *
 * The only source of randomness in the game. Its whole state is four 32-bit
 * integers, so it serialises to plain JSON and resumes exactly on any
 * platform (Node, browsers, Hermes, desktop).
 */
export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Current state, for saving. */
  state(): RngState;
}

/** Turns any string seed into a starting state (cyrb128 hash). */
export function seedState(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createRng(initial: RngState): Rng {
  let [a, b, c, d] = initial;

  const nextUint32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };

  return {
    next: () => nextUint32() / 4294967296,
    int(min, max) {
      invariant(
        Number.isInteger(min) && Number.isInteger(max),
        "int bounds must be integers",
      );
      invariant(min <= max, "int min must not exceed max");
      return min + Math.floor((nextUint32() / 4294967296) * (max - min + 1));
    },
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}
