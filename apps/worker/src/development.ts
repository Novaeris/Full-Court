import {
  createRng,
  developPlayers,
  seedState,
  type DevelopingPlayer,
} from "@fullcourt/game-engine";
import { developmentStepOn } from "@fullcourt/game-rules";
import { RATING_KEYS, type RatingKey } from "@fullcourt/game-types";

/**
 * Development during the season (docs/DESIGN.md, "Development during the
 * season"): at set days through the regular season, before that day's games,
 * every active player's ratings move a little. The worker does it because it
 * is the one that moves the season day by day.
 */

/** The step that happens before this day, if one does. */
export function developmentStep(day: number, lastDay: number): number | null {
  return developmentStepOn(day, lastDay);
}

/** The database column for each rating. */
export const RATING_COLUMN: Record<RatingKey, string> = {
  inside: "inside",
  midRange: "mid_range",
  threePoint: "three_point",
  freeThrow: "free_throw",
  passing: "passing",
  ballHandling: "ball_handling",
  offRebound: "off_rebound",
  defRebound: "def_rebound",
  perimeterD: "perimeter_d",
  interiorD: "interior_d",
  speed: "speed",
  strength: "strength",
  stamina: "stamina",
};

/** What a step needs from the database. */
export interface DevelopmentStore {
  /** Every active player in the season's league, on a team or not. */
  loadDevelopingPlayers(seasonId: string): Promise<DevelopingPlayer[]>;
  /** Stores a step's changes; does nothing if the step was already taken. Returns how many players changed. */
  applyDevelopment(
    seasonId: string,
    step: number,
    changes: Record<string, string | number>[],
  ): Promise<number>;
}

/**
 * Takes a step. It is seeded from the league, the year and the step, and the
 * players are taken in id order, so a requeued job gives the same result, and
 * the database stores each step once.
 */
export async function runDevelopmentStep(
  store: DevelopmentStore,
  season: { id: string; league_id: string; year: number },
  step: number,
): Promise<number> {
  const players = [...(await store.loadDevelopingPlayers(season.id))].sort(
    (a, b) => a.id.localeCompare(b.id),
  );
  const rng = createRng(
    seedState(`${season.league_id}:development:${season.year}:${step}`),
  );
  const changes = developPlayers(rng, players).map((d) => {
    const row: Record<string, string | number> = {
      id: d.id,
      overall: d.overall,
    };
    for (const key of RATING_KEYS) row[RATING_COLUMN[key]] = d.ratings[key];
    return row;
  });
  return store.applyDevelopment(season.id, step, changes);
}
