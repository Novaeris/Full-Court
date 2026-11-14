import type {
  GameReplay,
  RngState,
  SimPlayer,
  SimTeam,
} from "@fullcourt/game-engine";
import {
  DEFAULT_TEAM_STRATEGY,
  DEFENSE_STYLES,
  PACE_LEVELS,
  THREE_POINT_FOCUS_LEVELS,
  isPosition,
  type Game,
  type PlayerGameLine,
} from "@fullcourt/game-types";
import type { CoachRow, GameRow, PlayerRow } from "./db";

/** A scheduled game row as the engine's `Game`. */
export function toEngineGame(row: GameRow): Game {
  return {
    id: row.id,
    day: row.day,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    overtimes: 0,
  };
}

/** The league's saved RNG state: exactly four 32-bit integers. */
export function toRngState(values: readonly number[]): RngState {
  const ok =
    values.length === 4 &&
    values.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff);
  if (!ok) throw new Error("The league's RNG state is not valid.");
  return [
    values[0] as number,
    values[1] as number,
    values[2] as number,
    values[3] as number,
  ];
}

function toSimPlayer(row: PlayerRow): SimPlayer {
  if (!isPosition(row.position)) {
    throw new Error(`Player ${row.id} has an unknown position.`);
  }
  return {
    id: row.id,
    position: row.position,
    overall: row.overall,
    ratings: {
      inside: row.inside,
      midRange: row.mid_range,
      threePoint: row.three_point,
      freeThrow: row.free_throw,
      passing: row.passing,
      ballHandling: row.ball_handling,
      offRebound: row.off_rebound,
      defRebound: row.def_rebound,
      perimeterD: row.perimeter_d,
      interiorD: row.interior_d,
      speed: row.speed,
      strength: row.strength,
      stamina: row.stamina,
    },
  };
}

/**
 * The teams in a day's games, with their rosters. A team plays the strategy
 * and starters its owner saved, or the default if there are none (or they
 * aren't valid). Players with no team are free agents and don't play.
 */
export function toSimTeams(
  games: readonly GameRow[],
  players: readonly PlayerRow[],
  coaches: readonly CoachRow[] = [],
): SimTeam[] {
  const coachOf = new Map(coaches.map((c) => [c.id, c]));
  const teamIds = new Set(
    games.flatMap((g) => [g.home_team_id, g.away_team_id]),
  );
  const rosters = new Map<string, SimPlayer[]>();
  for (const id of teamIds) rosters.set(id, []);
  for (const row of players) {
    if (row.team_id && rosters.has(row.team_id)) {
      rosters.get(row.team_id)?.push(toSimPlayer(row));
    }
  }
  return [...rosters].map(([id, roster]) => {
    const coach = coachOf.get(id);
    const pick = <T extends string>(
      options: readonly T[],
      value: string | undefined,
      fallback: T,
    ): T =>
      (options as readonly string[]).includes(value ?? "")
        ? (value as T)
        : fallback;
    return {
      id,
      players: roster,
      strategy: {
        pace: pick(
          PACE_LEVELS,
          coach?.strategy_pace,
          DEFAULT_TEAM_STRATEGY.pace,
        ),
        threePointFocus: pick(
          THREE_POINT_FOCUS_LEVELS,
          coach?.strategy_three_point,
          DEFAULT_TEAM_STRATEGY.threePointFocus,
        ),
        defense: pick(
          DEFENSE_STYLES,
          coach?.strategy_defense,
          DEFAULT_TEAM_STRATEGY.defense,
        ),
      },
      // The engine ignores a list that isn't five of this roster.
      starters: coach && coach.starters.length > 0 ? coach.starters : undefined,
    };
  });
}

/** A finished game as the row `admin_commit_sim_day` expects. */
export function toDbResult(game: Game): {
  id: string;
  home_score: number;
  away_score: number;
  overtimes: number;
} {
  if (game.homeScore === null || game.awayScore === null) {
    throw new Error(`Game ${game.id} has no score.`);
  }
  return {
    id: game.id,
    home_score: game.homeScore,
    away_score: game.awayScore,
    overtimes: game.overtimes,
  };
}

/** A replay recipe as the row `admin_commit_sim_day` expects. */
export function toDbReplay(r: GameReplay): Record<string, unknown> {
  return {
    game_id: r.gameId,
    engine_version: r.engineVersion,
    rng_state: [...r.rngState],
    snapshot: r.snapshot,
  };
}

export function toDbLine(l: PlayerGameLine): Record<string, unknown> {
  return {
    game_id: l.gameId,
    player_id: l.playerId,
    team_id: l.teamId,
    started: l.started,
    minutes: l.minutes,
    points: l.points,
    rebounds: l.rebounds,
    assists: l.assists,
    steals: l.steals,
    blocks: l.blocks,
    turnovers: l.turnovers,
    fouls: l.fouls,
    fgm: l.fgm,
    fga: l.fga,
    tpm: l.tpm,
    tpa: l.tpa,
    ftm: l.ftm,
    fta: l.fta,
  };
}
