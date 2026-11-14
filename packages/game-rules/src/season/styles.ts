import type { TeamStrategy } from "@fullcourt/game-types";

/**
 * How a computer team chooses to play (docs/DESIGN.md, "Computer teams play to
 * their strengths"). It looks at its best eight players and picks the pace,
 * the three-point focus and the defence its roster suits. Pure, so the same
 * roster always chooses the same style.
 *
 * The thresholds sit about half a standard deviation either side of what a
 * generated league's teams average, so roughly a third of teams lean each way
 * on every choice and the league has a mix of styles.
 */

/** What a roster is judged on. */
export type StylePlayer = {
  overall: number;
  threePoint: number;
  speed: number;
  stamina: number;
  perimeterD: number;
  interiorD: number;
};

/** The players it looks at. */
export const STYLE_PLAYERS = 8;

export const STYLE_THRESHOLDS = {
  /** Mean of speed and stamina: fast at or above the first, slow at or below the second. */
  pace: { fast: 65.5, slow: 61.2 },
  /** Mean three-point rating. */
  threes: { high: 65.8, low: 60.4 },
  /** Perimeter defence minus interior defence: perimeter at or above the first, interior at or below the second. */
  defense: { perimeter: 5, interior: 0 },
} as const;

const mean = (values: readonly number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

/** The style a roster suits; the usual style for a roster of fewer than five. */
export function chooseTeamStrategy(
  players: readonly StylePlayer[],
): TeamStrategy {
  if (players.length < 5) {
    return { pace: "normal", threePointFocus: "normal", defense: "balanced" };
  }
  // Players who tie on overall are told apart by the ratings that matter here, so
  // which of them make the eight never depends on the order the roster arrives in.
  const top = [...players]
    .sort(
      (a, b) =>
        b.overall - a.overall ||
        b.threePoint - a.threePoint ||
        b.speed - a.speed ||
        b.stamina - a.stamina ||
        b.perimeterD - a.perimeterD ||
        b.interiorD - a.interiorD,
    )
    .slice(0, STYLE_PLAYERS);
  const tempo = mean(top.map((p) => (p.speed + p.stamina) / 2));
  const threes = mean(top.map((p) => p.threePoint));
  const lean = mean(top.map((p) => p.perimeterD - p.interiorD));
  const t = STYLE_THRESHOLDS;
  return {
    pace:
      tempo >= t.pace.fast ? "fast" : tempo <= t.pace.slow ? "slow" : "normal",
    threePointFocus:
      threes >= t.threes.high
        ? "high"
        : threes <= t.threes.low
          ? "low"
          : "normal",
    defense:
      lean >= t.defense.perimeter
        ? "perimeter"
        : lean <= t.defense.interior
          ? "interior"
          : "balanced",
  };
}
