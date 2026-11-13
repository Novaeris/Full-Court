import {
  DEFENSE_STYLES,
  PACE_LEVELS,
  RATING_KEYS,
  THREE_POINT_FOCUS_LEVELS,
  isPosition,
  type DefenseStyle,
  type Game,
  type Pace,
  type Ratings,
  type ThreePointFocus,
} from "@fullcourt/game-types";
import { createRng, type RngState } from "../rng/rng";
import { simulateGame } from "./game";
import type { SimPlayer, SimTeam, SimulatedGame } from "./types";

/**
 * The version of the game simulation. A game is stored as a recipe (the
 * rosters as they were, the RNG state and this version), not as its plays, so
 * the same recipe must always give the same plays.
 *
 * Bump it whenever a change makes the same recipe produce different plays:
 * tuning, a rule fix, a new factor. Games stored under an older version keep
 * their scores and box scores but can no longer be replayed exactly.
 * `replay.test.ts` fails when the output changes without a bump.
 */
export const ENGINE_VERSION = 1;

/** One player: id, position, overall, then the ratings in `RATING_KEYS` order. */
export type ReplayPlayer = (string | number)[];

export type ReplayTeam = {
  id: string;
  /** Pace, three-point focus and defence, in that order. */
  strategy: [Pace, ThreePointFocus, DefenseStyle];
  players: ReplayPlayer[];
};

/**
 * Everything a replay needs about the two teams as they were when the game
 * was played. Plain arrays of strings and numbers, so it stores as JSON.
 */
export type ReplaySnapshot = { home: ReplayTeam; away: ReplayTeam };

/** What a worker stores for a game so it can be replayed later. */
export type GameReplay = {
  gameId: string;
  engineVersion: number;
  /** The league RNG state just before this game was played. */
  rngState: RngState;
  snapshot: ReplaySnapshot;
};

function snapshotTeam(team: SimTeam): ReplayTeam {
  return {
    id: team.id,
    strategy: [
      team.strategy.pace,
      team.strategy.threePointFocus,
      team.strategy.defense,
    ],
    players: team.players.map((p) => [
      p.id,
      p.position,
      p.overall,
      ...RATING_KEYS.map((key) => p.ratings[key]),
    ]),
  };
}

export function snapshotTeams(home: SimTeam, away: SimTeam): ReplaySnapshot {
  return { home: snapshotTeam(home), away: snapshotTeam(away) };
}

const oneOf = <T extends string>(
  options: readonly T[],
  value: unknown,
  what: string,
): T => {
  if (
    typeof value === "string" &&
    (options as readonly string[]).includes(value)
  ) {
    return value as T;
  }
  throw new Error(`Replay snapshot: invalid ${what}.`);
};

function restorePlayer(entry: ReplayPlayer): SimPlayer {
  const [id, position, overall, ...values] = entry;
  if (
    typeof id !== "string" ||
    typeof position !== "string" ||
    !isPosition(position) ||
    typeof overall !== "number" ||
    values.length !== RATING_KEYS.length ||
    !values.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    throw new Error("Replay snapshot: invalid player.");
  }
  const ratings = Object.fromEntries(
    RATING_KEYS.map((key, i) => [key, values[i] as number]),
  ) as Ratings;
  return { id, position, overall, ratings };
}

function restoreTeam(team: ReplayTeam): SimTeam {
  if (
    !team ||
    typeof team.id !== "string" ||
    !Array.isArray(team.strategy) ||
    team.strategy.length !== 3 ||
    !Array.isArray(team.players)
  ) {
    throw new Error("Replay snapshot: invalid team.");
  }
  return {
    id: team.id,
    strategy: {
      pace: oneOf(PACE_LEVELS, team.strategy[0], "pace"),
      threePointFocus: oneOf(
        THREE_POINT_FOCUS_LEVELS,
        team.strategy[1],
        "three-point focus",
      ),
      defense: oneOf(DEFENSE_STYLES, team.strategy[2], "defence style"),
    },
    players: team.players.map(restorePlayer),
  };
}

/** The teams in a snapshot, ready to play. Throws on a malformed snapshot. */
export function restoreTeams(snapshot: ReplaySnapshot): {
  home: SimTeam;
  away: SimTeam;
} {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Replay snapshot: missing.");
  }
  return { home: restoreTeam(snapshot.home), away: restoreTeam(snapshot.away) };
}

/**
 * Plays a stored game again: the same plays, score and box score the worker
 * produced. It runs in a browser or on a phone as well as on the server.
 * `game` supplies the id, day and teams; its result is ignored.
 */
export function replayGame(
  game: Pick<Game, "id" | "day" | "homeTeamId" | "awayTeamId">,
  snapshot: ReplaySnapshot,
  rngState: RngState,
): SimulatedGame {
  const { home, away } = restoreTeams(snapshot);
  return simulateGame(
    {
      id: game.id,
      day: game.day,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      overtimes: 0,
    },
    home,
    away,
    createRng(rngState),
  );
}
