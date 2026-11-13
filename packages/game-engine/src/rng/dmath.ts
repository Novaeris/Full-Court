/**
 * Arithmetic that gives the same answer on every JavaScript engine.
 *
 * A game is stored as a recipe and replayed on whatever device is watching, so
 * the simulation must produce identical numbers in Node, Chrome, Firefox,
 * Safari and React Native. The ECMAScript specification only requires
 * `+ - * /`, `Math.sqrt` and a few others to be exact. It lets `Math.sin`,
 * `Math.cos`, `Math.log`, `Math.exp`, `Math.pow` and `**` differ in the last
 * digit between engines, and they do: measured in Node, Chromium, Firefox and
 * WebKit, 2 to 7 percent of inputs differ. A last-digit difference rarely
 * changes a game, but "rarely" isn't "never".
 *
 * So the simulation uses only the functions here and plain arithmetic.
 * `engine-math.test.ts` checks that nothing under `src/season` uses the others.
 */

/** x to the power 1.5, for x of zero or more. */
export function pow15(x: number): number {
  return x * Math.sqrt(x);
}

/**
 * Sine by Taylor series: fixed steps of exact arithmetic, accurate to about
 * 1e-16 for angles from 0 to pi (and a little beyond), which is all it is for.
 */
export function sin(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n <= 14; n++) {
    term = (-term * x2) / (2 * n * (2 * n + 1));
    sum += term;
  }
  return sum;
}

/** Cosine by Taylor series; see `sin`. */
export function cos(x: number): number {
  const x2 = x * x;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 14; n++) {
    term = (-term * x2) / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sum;
}
