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

/** A player on a roster, with his contract. Salaries are in thousands of dollars a year. */
export const RosterPlayerSchema = OffseasonPlayerSchema.extend({
  salary: z.number().int().nullable(),
  /** The last season his contract covers. */
  expires: z.number().int().nullable(),
});
export type RosterPlayer = z.infer<typeof RosterPlayerSchema>;

/** A free agent with what he asks for. */
export const FreeAgentSchema = OffseasonPlayerSchema.extend({
  askSalary: z.number().int(),
  askYears: z.number().int(),
  /** Your team may re-sign him over the cap. */
  yours: z.boolean(),
});
export type FreeAgent = z.infer<typeof FreeAgentSchema>;

/** The cap figures for a team: payroll, room and the hard ceiling. */
export const CapFiguresSchema = z.object({
  cap: z.number().int(),
  ceiling: z.number().int(),
  payroll: z.number().int(),
  /** The cap less payroll; negative when over the cap. */
  room: z.number().int(),
  minSalary: z.number().int(),
  maxSalary: z.number().int(),
  midLevel: z.number().int(),
  midLevelAvailable: z.boolean(),
});
export type CapFigures = z.infer<typeof CapFiguresSchema>;

/**
 * GET /api/v1/leagues/:leagueId/roster?team=: one of your rosters with
 * contracts, the cap figures and the best free agents. `open` is true from
 * free agency to the end of the preseason and through the regular season,
 * when players can be released and signed (after free agency's days, at 75% of
 * the asking price).
 */
export const RosterResponseSchema = z.object({
  teamId: z.uuid().nullable(),
  open: z.boolean(),
  min: z.number().int(),
  max: z.number().int(),
  figures: CapFiguresSchema.nullable(),
  players: z.array(RosterPlayerSchema),
  freeAgents: z.array(FreeAgentSchema),
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

/** An offer from your team to a free agent. */
export const FaOfferSchema = z.object({
  id: z.uuid(),
  player: OffseasonPlayerSchema,
  salary: z.number().int(),
  years: z.number().int(),
  madeDay: z.number().int(),
  status: z.enum(["pending", "accepted", "outbid", "void", "withdrawn"]),
  /**
   * What the offer is worth to him as a share of his asking price: the salary
   * adjusted for how your team looks to him (winning, role, city, history).
   */
  worth: z.number().nullable(),
});
export type FaOffer = z.infer<typeof FaOfferSchema>;

/** One thing that happened in free agency. */
export const FaEventSchema = z.object({
  day: z.number().int(),
  kind: z.enum([
    "signed",
    "re-signed",
    "released",
    "contract-ended",
    "drafted",
  ]),
  player: OffseasonPlayerSchema,
  teamId: z.uuid().nullable(),
  salary: z.number().int().nullable(),
  years: z.number().int().nullable(),
});
export type FaEvent = z.infer<typeof FaEventSchema>;

/**
 * GET /api/v1/leagues/:leagueId/free-agency?team=: free agency's 21 days. `day`
 * is how many have been simulated. `freeAgents` is the best of the market with
 * what each asks, whether your team may re-sign him and your offer, if any.
 */
export const FreeAgencyResponseSchema = z.object({
  teamId: z.uuid().nullable(),
  /** True while offers can be made: the free-agency stage, before the last day. */
  open: z.boolean(),
  day: z.number().int(),
  days: z.number().int(),
  /** The league calendar date of the next day to simulate, `YYYY-MM-DD`. */
  date: z.string().nullable(),
  figures: CapFiguresSchema.nullable(),
  /** How your team looks to a free agent, each from 0 to 1 (0.5 is average). */
  appeal: z
    .object({ winning: z.number(), market: z.number(), history: z.number() })
    .nullable(),
  freeAgents: z.array(
    FreeAgentSchema.extend({
      /** What he cares about most. */
      priorities: z.array(
        z.enum(["money", "winning", "role", "market", "history"]),
      ),
      /** The role he would have on your team. */
      role: z.enum(["starter", "rotation", "bench"]),
      offer: FaOfferSchema.nullable(),
      /** Offers waiting from other teams are not shown, only how many there are. */
      otherOffers: z.number().int(),
    }),
  ),
  freeAgentTotal: z.number().int(),
  myOffers: z.array(FaOfferSchema),
  /** What happened, newest first. */
  log: z.array(FaEventSchema),
});
export type FreeAgencyResponse = z.infer<typeof FreeAgencyResponseSchema>;

/** POST /api/v1/leagues/:leagueId/free-agency/offers: make or change an offer. */
export const MakeOfferRequestSchema = z.object({
  teamId: z.uuid().optional(),
  playerId: z.uuid(),
  salary: z.number().int().min(1),
  years: z.number().int().min(1).max(5),
});
export type MakeOfferRequest = z.infer<typeof MakeOfferRequestSchema>;

/** DELETE /api/v1/leagues/:leagueId/free-agency/offers: withdraw an offer. */
export const WithdrawOfferRequestSchema = z.object({
  teamId: z.uuid().optional(),
  offerId: z.uuid(),
});
export type WithdrawOfferRequest = z.infer<typeof WithdrawOfferRequestSchema>;

/** POST /api/v1/leagues/:leagueId/free-agency/sim: simulate a day, a week, or to the end. */
export const SimFreeAgencyRequestSchema = z.object({
  days: z.union([z.literal(1), z.literal(7), z.literal("end")]).default(1),
});
export type SimFreeAgencyRequest = z.infer<typeof SimFreeAgencyRequestSchema>;

/** A player in a trade: with his contract and what he is worth in a trade. */
export const TradePlayerSchema = OffseasonPlayerSchema.extend({
  salary: z.number().int(),
  /** Seasons left on his contract, counting the current one. */
  yearsLeft: z.number().int(),
  /** His trade value, rounded (only the comparison matters). */
  value: z.number().int(),
});
export type TradePlayer = z.infer<typeof TradePlayerSchema>;

/** A trade that was made. */
export const TradeRecordSchema = z.object({
  id: z.uuid(),
  seasonYear: z.number().int(),
  /** The season's day, or 0 in the offseason. */
  day: z.number().int(),
  teamA: z.uuid(),
  teamB: z.uuid(),
  gaveA: z.array(OffseasonPlayerSchema),
  gaveB: z.array(OffseasonPlayerSchema),
});
export type TradeRecord = z.infer<typeof TradeRecordSchema>;

/**
 * GET /api/v1/leagues/:leagueId/trades?team=: whether trades are open, your
 * roster with contracts, the computer teams you can trade with and recent trades.
 */
export const TradesResponseSchema = z.object({
  teamId: z.uuid().nullable(),
  open: z.boolean(),
  /** Why trades are closed, when they are. */
  closedReason: z.string().nullable(),
  /** The last game day trades are open, in the regular season. */
  deadlineDay: z.number().int().nullable(),
  day: z.number().int(),
  cap: z.number().int(),
  payroll: z.number().int(),
  roster: z.array(TradePlayerSchema),
  partners: z.array(
    z.object({
      teamId: z.uuid(),
      payroll: z.number().int(),
      size: z.number().int(),
    }),
  ),
  history: z.array(TradeRecordSchema),
});
export type TradesResponse = z.infer<typeof TradesResponseSchema>;

/** GET /api/v1/leagues/:leagueId/trades/partner?partner=: a computer team's roster with contracts. */
export const TradePartnerResponseSchema = z.object({
  teamId: z.uuid(),
  payroll: z.number().int(),
  roster: z.array(TradePlayerSchema),
});
export type TradePartnerResponse = z.infer<typeof TradePartnerResponseSchema>;

/** POST /trades/evaluate and POST /trades: your players (`give`) for theirs (`get`). */
export const TradeProposalSchema = z.object({
  teamId: z.uuid().optional(),
  partnerId: z.uuid(),
  give: z.array(z.uuid()).max(5),
  get: z.array(z.uuid()).max(5),
});
export type TradeProposal = z.infer<typeof TradeProposalSchema>;

export const TradeEvaluationSchema = z.object({
  /** The trade is legal: rosters, the hard ceiling and salary matching. */
  legal: z.boolean(),
  problems: z.array(z.string()),
  /** The computer team would say yes. */
  accepts: z.boolean(),
  reasons: z.array(z.string()),
  /** How the deal looks to them, in words. */
  deal: z.string(),
  payrollAfter: z.object({ yours: z.number().int(), theirs: z.number().int() }),
});
export type TradeEvaluation = z.infer<typeof TradeEvaluationSchema>;

export const TradeResultSchema = z.object({
  evaluation: TradeEvaluationSchema,
  /** The trade was made. */
  done: z.boolean(),
});
export type TradeResult = z.infer<typeof TradeResultSchema>;

/** POST /api/v1/leagues/:leagueId/trades/shop: what the computer teams would give for your players. */
export const ShopRequestSchema = z.object({
  teamId: z.uuid().optional(),
  playerIds: z.array(z.uuid()).min(1).max(3),
});
export type ShopRequest = z.infer<typeof ShopRequestSchema>;

export const ShopResponseSchema = z.object({
  offers: z.array(
    z.object({
      teamId: z.uuid(),
      get: z.array(TradePlayerSchema),
      deal: z.string(),
    }),
  ),
});
export type ShopResponse = z.infer<typeof ShopResponseSchema>;
