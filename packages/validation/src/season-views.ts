import {
  CAMP_PROGRAMS,
  OFFSEASON_STAGES,
  STAFF_ROLES,
} from "@fullcourt/game-types";
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

/** A player in an offseason report: who they are and what the offseason did to them. */
export const OffseasonPlayerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.enum(["PG", "SG", "SF", "PF", "C"]),
  age: z.number().int(),
  overall: z.number().int(),
  potential: z.number().int(),
  teamId: z.uuid().nullable(),
});
export type OffseasonPlayer = z.infer<typeof OffseasonPlayerSchema>;

/**
 * GET /api/v1/leagues/:leagueId/offseason: what the latest offseason did.
 * `year` is the year of the season it led into, or null before the first
 * offseason. Movers compare each player's overall before and after.
 */
export const StageInfoSchema = z.object({
  stage: z.enum(OFFSEASON_STAGES),
  label: z.string(),
  /** `YYYY-MM-DD`. */
  start: z.string(),
  end: z.string(),
  status: z.enum(["done", "current", "upcoming"]),
});
export type StageInfo = z.infer<typeof StageInfoSchema>;

export const CampReportRowSchema = z.object({
  player: OffseasonPlayerSchema,
  program: z.enum(CAMP_PROGRAMS),
  before: z.number().int(),
  after: z.number().int(),
});
export type CampReportRow = z.infer<typeof CampReportRowSchema>;

/** How far the current draft has got. */
export const DraftStatusSchema = z.object({
  lotteryHeld: z.boolean(),
  made: z.number().int(),
  total: z.number().int(),
});
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

export const OffseasonResponseSchema = z.object({
  /** The current offseason's draft, once its stage has been reached; else null. */
  draftStatus: DraftStatusSchema.nullable(),
  year: z.number().int().nullable(),
  /** The current offseason's stage, or null when no offseason is under way. */
  stage: z.enum(OFFSEASON_STAGES).nullable(),
  /** The stages of the current offseason with their dates; empty outside one. */
  stages: z.array(StageInfoSchema),
  /** Who went to training camp and what changed, for the latest camp. */
  campReport: z.array(CampReportRowSchema),
  draft: z.array(
    z.object({
      pick: z.number().int(),
      round: z.number().int(),
      teamId: z.uuid(),
      /** Where the picking team finished, 1 = best. */
      finishRank: z.number().int(),
      /** The pick it would have had without the lottery. */
      expectedPick: z.number().int(),
      /** Its chance of the first pick; null if it made the playoffs. */
      lotteryOdds: z.number().nullable(),
      /** Null for a pick not yet made. */
      player: OffseasonPlayerSchema.nullable(),
    }),
  ),
  retired: z.array(OffseasonPlayerSchema),
  risers: z.array(OffseasonPlayerSchema.extend({ change: z.number().int() })),
  fallers: z.array(OffseasonPlayerSchema.extend({ change: z.number().int() })),
});
export type OffseasonResponse = z.infer<typeof OffseasonResponseSchema>;

/** A coach or scout. Salary is in thousands of dollars a year. */
export const StaffMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(STAFF_ROLES),
  rating: z.number().int(),
  age: z.number().int(),
  salary: z.number().int(),
  teamId: z.uuid().nullable(),
  contractYears: z.number().int().nullable(),
});
export type StaffMember = z.infer<typeof StaffMemberSchema>;

/**
 * GET /api/v1/leagues/:leagueId/staff: one of your teams' staff, the market,
 * and the budget. `open` is true during an offseason, when hiring is allowed.
 */
export const StaffResponseSchema = z.object({
  teamId: z.uuid().nullable(),
  /** What a team may spend on staff, in thousands of dollars. */
  budget: z.number().int(),
  payroll: z.number().int(),
  team: z.array(StaffMemberSchema),
  market: z.array(StaffMemberSchema),
  open: z.boolean(),
});
export type StaffResponse = z.infer<typeof StaffResponseSchema>;

/** POST /api/v1/leagues/:leagueId/staff: hire a free agent into his role. */
export const HireStaffRequestSchema = z.object({
  teamId: z.uuid().optional(),
  staffId: z.uuid(),
  years: z.number().int().min(1).max(3),
});
export type HireStaffRequest = z.infer<typeof HireStaffRequestSchema>;

/** DELETE /api/v1/leagues/:leagueId/staff: let a staff member go. */
export const ReleaseStaffRequestSchema = z.object({
  teamId: z.uuid().optional(),
  staffId: z.uuid(),
});
export type ReleaseStaffRequest = z.infer<typeof ReleaseStaffRequestSchema>;

/** GET /api/v1/leagues/:leagueId/camp: who can go to training camp and who is going. */
export const CampResponseSchema = z.object({
  teamId: z.uuid().nullable(),
  /** True while the training-camp stage is under way and the roster can be changed. */
  open: z.boolean(),
  places: z.number().int(),
  programs: z.array(
    z.object({
      id: z.enum(CAMP_PROGRAMS),
      label: z.string(),
      ratings: z.array(z.string()),
    }),
  ),
  roster: z.array(
    z.object({
      player: OffseasonPlayerSchema,
      program: z.enum(CAMP_PROGRAMS).nullable(),
    }),
  ),
});
export type CampResponse = z.infer<typeof CampResponseSchema>;

/** PUT /api/v1/leagues/:leagueId/camp: replaces the team's camp roster. */
export const SetCampRequestSchema = z.object({
  teamId: z.uuid().optional(),
  assignments: z
    .array(z.object({ playerId: z.uuid(), program: z.enum(CAMP_PROGRAMS) }))
    .max(8),
});
export type SetCampRequest = z.infer<typeof SetCampRequestSchema>;

/** A prospect as one team's scouts see him. */
export const ProspectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.enum(["PG", "SG", "SF", "PF", "C"]),
  age: z.number().int(),
  heightInches: z.number().int(),
  weightPounds: z.number().int(),
  /** The overall rating the scouts see; the true one is hidden. */
  overall: z.number().int(),
  potential: z.number().int(),
});
export type Prospect = z.infer<typeof ProspectSchema>;

/**
 * GET /api/v1/leagues/:leagueId/draft?team=: the draft as one of your teams
 * sees it. `board` is the prospects still available, with the scouts' view of
 * them; `order` is every pick so far, the lottery's result. `onTheClock` is
 * the next pick to be made, and `suggestion` the prospect the team's scouts
 * would take.
 */
export const DraftResponseSchema = z.object({
  teamId: z.uuid().nullable(),
  /** True during the draft stage of an offseason. */
  open: z.boolean(),
  lotteryHeld: z.boolean(),
  year: z.number().int().nullable(),
  onTheClock: z
    .object({
      pick: z.number().int(),
      round: z.number().int(),
      teamId: z.uuid(),
      /** The team is yours and its drafting is not on AI Assist. */
      yourPick: z.boolean(),
      /** The team is yours (whatever AI Assist is set to), so you can make its pick. */
      mine: z.boolean(),
    })
    .nullable(),
  suggestion: z.uuid().nullable(),
  order: z.array(
    z.object({
      pick: z.number().int(),
      round: z.number().int(),
      teamId: z.uuid(),
      finishRank: z.number().int(),
      expectedPick: z.number().int(),
      lotteryOdds: z.number().nullable(),
      player: OffseasonPlayerSchema.nullable(),
    }),
  ),
  board: z.array(ProspectSchema),
});
export type DraftResponse = z.infer<typeof DraftResponseSchema>;

/** POST /api/v1/leagues/:leagueId/draft/pick: make your team's pick. */
export const DraftPickRequestSchema = z.object({
  teamId: z.uuid().optional(),
  prospectId: z.uuid(),
});
export type DraftPickRequest = z.infer<typeof DraftPickRequestSchema>;

/**
 * POST /api/v1/leagues/:leagueId/draft/sim: the computer teams make their
 * picks. `mode` says where to stop: `my-pick` at the next pick of any team you
 * run, so you can make it yourself (AI Assist or not); `advance` at the next
 * pick of a team of yours whose drafting is not on AI Assist (AI Assist makes
 * the others); `auto` never, so your teams' picks are made for you too.
 */
export const DraftSimRequestSchema = z.object({
  mode: z.enum(["my-pick", "advance", "auto"]).default("my-pick"),
});
export type DraftSimRequest = z.infer<typeof DraftSimRequestSchema>;

/**
 * GET /api/v1/leagues/:leagueId/roster?team=: one of your rosters and the best
 * free agents. `open` is true from free agency to the end of the preseason,
 * when players can be signed and released.
 */
export const RosterResponseSchema = z.object({
  teamId: z.uuid().nullable(),
  open: z.boolean(),
  min: z.number().int(),
  max: z.number().int(),
  players: z.array(OffseasonPlayerSchema),
  freeAgents: z.array(OffseasonPlayerSchema),
  freeAgentTotal: z.number().int(),
});
export type RosterResponse = z.infer<typeof RosterResponseSchema>;

/** POST or DELETE /api/v1/leagues/:leagueId/roster: sign a free agent, or release a player. */
export const RosterMoveRequestSchema = z.object({
  teamId: z.uuid().optional(),
  playerId: z.uuid(),
});
export type RosterMoveRequest = z.infer<typeof RosterMoveRequestSchema>;

/** PATCH /api/v1/leagues/:leagueId/ai-assist: switch AI Assist on or off for a franchise you run. */
export const UpdateAiAssistRequestSchema = z.object({
  teamId: z.uuid().optional(),
  aiAssist: z
    .object({
      trades: z.boolean(),
      rosterCoverage: z.boolean(),
      rosterManagement: z.boolean(),
      scouting: z.boolean(),
      drafting: z.boolean(),
    })
    .partial(),
});
export type UpdateAiAssistRequest = z.infer<typeof UpdateAiAssistRequestSchema>;

export const AiAssistResponseSchema = z.object({
  teamId: z.uuid().nullable(),
  aiAssist: z.object({
    trades: z.boolean(),
    rosterCoverage: z.boolean(),
    rosterManagement: z.boolean(),
    scouting: z.boolean(),
    drafting: z.boolean(),
  }),
});
export type AiAssistResponse = z.infer<typeof AiAssistResponseSchema>;
