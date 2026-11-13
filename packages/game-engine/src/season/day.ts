import type { BoxScore, Game, PlayEvent } from "@fullcourt/game-types";
import { createRng, type RngState } from "../rng/rng";
import { simulateGame } from "./game";
import type { SimTeam } from "./types";

export type SimulateDayInput = {
  /** The games to play, all on the same day, none already final. */
  games: readonly Game[];
  /** Every team in those games. */
  teams: readonly SimTeam[];
  /** The league's RNG state before this day. */
  rngState: RngState;
};

export type SimulateDayResult = {
  /** The input games, now final. */
  games: Game[];
  plays: PlayEvent[];
  boxScores: BoxScore[];
  /** The league's RNG state after this day; save it for the next one. */
  rngState: RngState;
};

/**
 * Plays one day of games. Rows in, rows out: nothing is read from outside the
 * input, and only the rows that changed come back. Games are played in the
 * order given, sharing one RNG, so a day is reproducible from its input.
 *
 * Teams may play at most once per day. Throws on a game that is already
 * final or refers to an unknown team.
 */
export function simulateDay(input: SimulateDayInput): SimulateDayResult {
  const teams = new Map(input.teams.map((t) => [t.id, t]));
  const busy = new Set<string>();
  const rng = createRng(input.rngState);

  const games: Game[] = [];
  const plays: PlayEvent[] = [];
  const boxScores: BoxScore[] = [];
  for (const game of input.games) {
    if (game.status !== "scheduled") {
      throw new Error(`Game ${game.id} has already been played.`);
    }
    const home = teams.get(game.homeTeamId);
    const away = teams.get(game.awayTeamId);
    if (!home || !away) throw new Error(`Game ${game.id} has an unknown team.`);
    for (const id of [home.id, away.id]) {
      if (busy.has(id)) throw new Error(`Team ${id} plays twice on one day.`);
      busy.add(id);
    }
    const result = simulateGame(game, home, away, rng);
    games.push(result.game);
    plays.push(...result.plays);
    boxScores.push(result.boxScore);
  }
  return { games, plays, boxScores, rngState: rng.state() };
}
