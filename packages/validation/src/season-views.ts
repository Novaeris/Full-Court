import { PLAY_KINDS, POSITIONS, SHOT_ZONES } from "@fullcourt/game-types";
import { z } from "zod";
import { SeasonSchema } from "./simulation";

/** What the season pages show: the schedule, the standings and a game. */

const count = z.number().int().min(0);

export const GameSummarySchema = z.object({
  id: z.uuid(),
  /** Game day within the season, from 1. */
  day: z.number().int().min(1),
  homeTeamId: z.uuid(),
  awayTeamId: z.uuid(),
  status: z.enum(["scheduled", "final"]),
  /** Null until the game is final. */
  homeScore: count.nullable(),
  awayScore: count.nullable(),
  overtimes: count,
  /** For a playoff game: its round and which game of the series it is. */
  round: z.number().int().min(1).nullable(),
  gameNumber: z.number().int().min(1).nullable(),
});
export type GameSummary = z.infer<typeof GameSummarySchema>;

/**
 * GET /api/v1/leagues/:leagueId/schedule
 * `?team=<id>` lists one team's whole season; `?day=<n>` lists one day.
 * With neither, it lists the season's current day.
 */
export const ScheduleResponseSchema = z.object({
  season: SeasonSchema.nullable(),
  games: z.array(GameSummarySchema),
});
export type ScheduleResponse = z.infer<typeof ScheduleResponseSchema>;

export const StandingRowSchema = z.object({
  teamId: z.uuid(),
  conferenceId: z.string(),
  divisionId: z.string(),
  /** 1 for the best record in the league. */
  rank: z.number().int().min(1),
  wins: count,
  losses: count,
  winPct: z.number().min(0).max(1),
  homeWins: count,
  homeLosses: count,
  awayWins: count,
  awayLosses: count,
  divisionWins: count,
  divisionLosses: count,
  conferenceWins: count,
  conferenceLosses: count,
  pointsFor: count,
  pointsAgainst: count,
  /** "W3" or "L2"; empty before a game is played. */
  streak: z.string(),
  /** Wins and losses in the last ten games, such as "7-3". */
  lastTen: z.string(),
});
export type StandingRow = z.infer<typeof StandingRowSchema>;

/** GET /api/v1/leagues/:leagueId/standings: every team, best first. */
export const StandingsResponseSchema = z.object({
  season: SeasonSchema.nullable(),
  rows: z.array(StandingRowSchema),
});
export type StandingsResponse = z.infer<typeof StandingsResponseSchema>;

export const BoxScoreLineSchema = z.object({
  playerId: z.uuid(),
  teamId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  jersey: z.number().int(),
  position: z.enum(POSITIONS),
  started: z.boolean(),
  minutes: count,
  points: count,
  rebounds: count,
  assists: count,
  steals: count,
  blocks: count,
  turnovers: count,
  fouls: count,
  fgm: count,
  fga: count,
  tpm: count,
  tpa: count,
  ftm: count,
  fta: count,
});
export type BoxScoreLine = z.infer<typeof BoxScoreLineSchema>;

/**
 * What it takes to replay a game: both teams' ratings as they were, the RNG
 * state before the game and the engine version. The client replays it with
 * `replayGame` from @fullcourt/game-engine.
 */
export const GameReplaySchema = z.object({
  engineVersion: z.number().int().min(1),
  rngState: z.array(z.number().int().min(0)).length(4),
  snapshot: z.record(z.string(), z.unknown()),
});
export type GameReplayPayload = z.infer<typeof GameReplaySchema>;

/**
 * Whether a game can be replayed: `available`, `engine-updated` (the game was
 * played under an older version of the simulation, so a replay would differ)
 * or `missing` (it has no recipe, for example once its season is archived).
 */
export const REPLAY_STATUSES = [
  "available",
  "engine-updated",
  "missing",
] as const;

/** GET /api/v1/leagues/:leagueId/games/:gameId */
export const GameDetailSchema = z.object({
  game: GameSummarySchema,
  lines: z.array(BoxScoreLineSchema),
  replayStatus: z.enum(REPLAY_STATUSES),
  /** Present only when `replayStatus` is `available`. */
  replay: GameReplaySchema.nullable(),
});
export type GameDetail = z.infer<typeof GameDetailSchema>;

export const PlayEventSchema = z.object({
  gameId: z.string(),
  seq: z.number().int().min(1),
  period: z.number().int().min(1),
  clock: z.number().int().min(0),
  kind: z.enum(PLAY_KINDS),
  teamId: z.string().nullable(),
  playerId: z.string().nullable(),
  assistPlayerId: z.string().nullable(),
  blockPlayerId: z.string().nullable(),
  stealPlayerId: z.string().nullable(),
  outPlayerId: z.string().nullable(),
  shotZone: z.enum(SHOT_ZONES).nullable(),
  made: z.boolean().nullable(),
  offensive: z.boolean().nullable(),
  points: z.number().int().min(0).max(3),
  homeScore: count,
  awayScore: count,
  transition: z.boolean(),
  at: z.object({ x: z.number(), y: z.number() }).nullable(),
});

/**
 * GET /api/v1/leagues/:leagueId/games/:gameId/plays: the server replays the
 * game itself. A client uses it when its own replay doesn't end on the stored
 * final score (an engine that rounds differently, say).
 */
export const GamePlaysSchema = z.object({
  plays: z.array(PlayEventSchema),
  /** Who started the game, home then away, which a viewer needs to follow the substitutions. */
  starters: z.object({
    home: z.array(z.string()),
    away: z.array(z.string()),
  }),
});
export type GamePlays = z.infer<typeof GamePlaysSchema>;

export const PlayoffTeamSchema = z.object({
  teamId: z.uuid(),
  /** Seed in its conference (or the league), 1 is best. */
  seed: z.number().int().min(1),
  /** Place in the regular-season standings; the better one has home court. */
  rank: z.number().int().min(1),
  /** Games won in the series. */
  wins: count,
});

export const PlayoffSeriesSchema = z.object({
  id: z.uuid(),
  round: z.number().int().min(1),
  /** Position in the round; the winners of slots 2k and 2k + 1 meet in slot k of the next. */
  slot: z.number().int().min(0),
  bestOf: z.number().int(),
  a: PlayoffTeamSchema,
  b: PlayoffTeamSchema,
  winnerTeamId: z.uuid().nullable(),
  /** The series' games in order. Empty once its season is archived. */
  games: z.array(GameSummarySchema),
});
export type PlayoffSeries = z.infer<typeof PlayoffSeriesSchema>;

/**
 * GET /api/v1/leagues/:leagueId/playoffs: the bracket. `rounds` is empty (and
 * `series` too) until the bracket has been built, which happens when the
 * playoffs are first simulated.
 */
export const PlayoffsResponseSchema = z.object({
  season: SeasonSchema.nullable(),
  rounds: z.array(z.object({ round: z.number().int(), label: z.string() })),
  series: z.array(PlayoffSeriesSchema),
});
export type PlayoffsResponse = z.infer<typeof PlayoffsResponseSchema>;
