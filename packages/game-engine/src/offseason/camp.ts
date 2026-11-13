import {
  RATING_KEYS,
  type Position,
  type Ratings,
} from "@fullcourt/game-types";
import {
  CAMP_PROGRAMS,
  CAMP_PROGRAM_INFO,
  campGainMean,
  clampRating,
  computeOverall,
  type CampProgram,
} from "@fullcourt/game-rules";
import { normalSum } from "../rng/helpers";
import type { Rng } from "../rng/rng";

/**
 * Training camp: each attending player works on one program and gains in its
 * ratings, more if he is young and if the coach who runs it is good. Nobody is
 * pushed past his potential, and no single camp makes a star.
 */

export type CampPlayer = {
  id: string;
  teamId: string;
  position: Position;
  age: number;
  ratings: Ratings;
  overall: number;
  potential: number;
};

export type CampAssignment = { playerId: string; program: CampProgram };

export type CampResult = {
  playerId: string;
  teamId: string;
  program: CampProgram;
  ratings: Ratings;
  overall: number;
  potential: number;
};

/** The program a player can gain most from: the one whose ratings are lowest relative to his overall. */
function weakestProgram(player: CampPlayer): CampProgram {
  let best: CampProgram = CAMP_PROGRAMS[0];
  let bestGap = -Infinity;
  for (const program of CAMP_PROGRAMS) {
    const keys = CAMP_PROGRAM_INFO[program].ratings;
    const average =
      keys.reduce((sum, key) => sum + player.ratings[key], 0) / keys.length;
    const gap = player.overall - average;
    if (gap > bestGap) {
      bestGap = gap;
      best = program;
    }
  }
  return best;
}

/**
 * The computer teams' camp: the young players with the most room to grow
 * (potential above overall, then youngest) go, each to the program in which he
 * is weakest.
 */
export function chooseCamp(
  roster: readonly CampPlayer[],
  places: number,
): CampAssignment[] {
  return [...roster]
    .sort(
      (a, b) =>
        b.potential - b.overall - (a.potential - a.overall) ||
        a.age - b.age ||
        a.id.localeCompare(b.id),
    )
    .slice(0, places)
    .map((p) => ({ playerId: p.id, program: weakestProgram(p) }));
}

/**
 * Holds the camp. `developmentCoach` and `conditioningCoach` are the ratings of
 * each team's coaches, where it has them.
 */
export function runCamp(
  rng: Rng,
  input: {
    attendees: readonly (CampPlayer & { program: CampProgram })[];
    developmentCoach: ReadonlyMap<string, number | null>;
    conditioningCoach: ReadonlyMap<string, number | null>;
  },
): CampResult[] {
  return input.attendees.map((p) => {
    const coach =
      p.program === "athleticism"
        ? (input.conditioningCoach.get(p.teamId) ?? null)
        : (input.developmentCoach.get(p.teamId) ?? null);
    const mean = campGainMean(p.age, coach);
    const gains = {} as Record<string, number>;
    for (const key of CAMP_PROGRAM_INFO[p.program].ratings) {
      gains[key] = Math.max(0, Math.round(mean + normalSum(rng, 0, 0.8)));
    }
    const apply = (scale: number) => {
      const ratings = { ...p.ratings };
      for (const key of RATING_KEYS) {
        const gain = gains[key];
        if (gain !== undefined) {
          ratings[key] = clampRating(
            p.ratings[key] + Math.max(0, gain - scale),
          );
        }
      }
      return ratings;
    };
    // Nobody ends camp past his potential: trim the gains until he fits.
    const ceiling = Math.max(p.potential, p.overall);
    let scale = 0;
    let ratings = apply(scale);
    while (computeOverall(p.position, ratings) > ceiling && scale < 10) {
      scale += 1;
      ratings = apply(scale);
    }
    return {
      playerId: p.id,
      teamId: p.teamId,
      program: p.program,
      ratings,
      overall: computeOverall(p.position, ratings),
      potential: p.potential,
    };
  });
}
