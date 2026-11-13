/**
 * Season, schedule, game and box-score types. Types and plain data only; the
 * rules live in @fullcourt/game-rules and the simulation in @fullcourt/game-engine.
 *
 * Everything here is JSON-safe: it is a Postgres row, an API body or a
 * worker job payload without conversion.
 */

/** Where a league is in its yearly cycle. Later phases add the offseason. */
export const SEASON_PHASES = [
  "regular-season",
  "playoffs",
  "complete",
] as const;
export type SeasonPhase = (typeof SEASON_PHASES)[number];

/**
 * The league calendar. `day` is the next game day to simulate, starting at 1;
 * game time is data, never the clock.
 */
export type SeasonState = {
  /** Display year of the season, such as 2026. */
  year: number;
  phase: SeasonPhase;
  day: number;
};

/**
 * Games each pair of teams plays per season, by how the teams relate. Every
 * value is a positive whole number.
 */
export type ScheduleTiers = {
  /** Same division. */
  division: number;
  /** Same conference, different division. */
  conference: number;
  /** Different conference. */
  interconference: number;
};

export const DEFAULT_SCHEDULE_TIERS: Readonly<ScheduleTiers> = {
  division: 4,
  conference: 3,
  interconference: 2,
};

export const SCHEDULE_PRESETS = [
  "short",
  "standard",
  "long",
  "custom",
] as const;
export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];

/**
 * Tiers for each named preset; `custom` uses whatever tiers the league stores.
 * The resulting season length depends on the league structure
 * (`seasonLength` in game-rules): in the standard 30-team league these play
 * 43, 76 and 86 games.
 */
export const SCHEDULE_PRESET_TIERS: Record<
  Exclude<SchedulePreset, "custom">,
  Readonly<ScheduleTiers>
> = {
  short: { division: 2, conference: 2, interconference: 1 },
  standard: DEFAULT_SCHEDULE_TIERS,
  long: { division: 4, conference: 4, interconference: 2 },
};

export type GameStatus = "scheduled" | "final";

/** One scheduled or played game. Scores are null until it is final. */
export type Game = {
  id: string;
  /** Game day within the season, starting at 1. */
  day: number;
  homeTeamId: string;
  awayTeamId: string;
  status: GameStatus;
  homeScore: number | null;
  awayScore: number | null;
  /** Overtime periods played, 0 for a game decided in regulation. */
  overtimes: number;
};

/** A player's line for one game. Minutes are whole minutes. */
export type PlayerGameLine = {
  gameId: string;
  playerId: string;
  teamId: string;
  started: boolean;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
};

/** Both teams' player lines for one game. */
export type BoxScore = { gameId: string; lines: PlayerGameLine[] };

/**
 * Play-by-play. The event list is the source of truth for a game: scores and
 * box scores are derived from it, so they can never disagree with what the
 * viewer sees.
 */
export const PLAY_KINDS = [
  "period-start",
  "made-shot",
  "missed-shot",
  "free-throw",
  "rebound",
  "turnover",
  "foul",
  "substitution",
  "period-end",
] as const;
export type PlayKind = (typeof PLAY_KINDS)[number];

export const SHOT_ZONES = ["inside", "mid-range", "three"] as const;
export type ShotZone = (typeof SHOT_ZONES)[number];

/** Regulation periods and lengths, in seconds. */
export const REGULATION_PERIODS = 4;
export const PERIOD_SECONDS = 720;
export const OVERTIME_SECONDS = 300;

/**
 * A spot on the full court, in feet. `x` runs the length of the court from
 * 0 (left baseline) to 94 (right baseline); `y` runs across it from 0 to 50.
 * The baskets are at `LEFT_BASKET` and `RIGHT_BASKET`. The home team attacks
 * the right basket in periods 1 and 2 and the left one after that
 * (`attacksRight` in game-rules), so a viewer can draw every play where it
 * happened without mirroring anything.
 */
export type CourtPoint = { x: number; y: number };
export const COURT_LENGTH = 94;
export const COURT_WIDTH = 50;
export const LEFT_BASKET: Readonly<CourtPoint> = { x: 5.25, y: 25 };
export const RIGHT_BASKET: Readonly<CourtPoint> = { x: 88.75, y: 25 };

/**
 * One event. Which fields are set depends on `kind`:
 *
 * - `made-shot`: `playerId` shot it; `assistPlayerId` passed it, if anyone.
 * - `missed-shot`: `playerId` shot it; `blockPlayerId` blocked it, if anyone.
 * - `free-throw`: `playerId` shot it; `made` says if it went in.
 * - `rebound`: `playerId` got it; `offensive` says which end.
 * - `turnover`: `playerId` lost the ball; `stealPlayerId` took it, if anyone.
 *   A steal usually starts a fast break, so the next shot is `transition` and
 *   its `assistPlayerId` is often the stealer or rebounder who led it.
 * - `foul`: `playerId` committed it; `teamId` is the fouling team.
 * - `substitution`: `playerId` came on and `outPlayerId` went off.
 * - `period-start` and `period-end` have no team or player.
 */
export type PlayEvent = {
  gameId: string;
  /** Order within the game, starting at 1. */
  seq: number;
  /** 1 to 4 in regulation, 5 and up in overtime. */
  period: number;
  /** Whole seconds left in the period once the event has happened. */
  clock: number;
  kind: PlayKind;
  teamId: string | null;
  playerId: string | null;
  assistPlayerId: string | null;
  blockPlayerId: string | null;
  stealPlayerId: string | null;
  outPlayerId: string | null;
  shotZone: ShotZone | null;
  made: boolean | null;
  offensive: boolean | null;
  /** Points this event added to its team's score. */
  points: number;
  homeScore: number;
  awayScore: number;
  /**
   * True when the play happened on a fast break: the offence got the ball
   * moving before the defence could set up. Set on the turnover, shot, foul
   * and free-throw events of that possession.
   */
  transition: boolean;
  /**
   * Where it happened: the shot, the board, the spot a ball was lost or a
   * foul called, or the free-throw line. Null for substitutions and for
   * period starts and ends.
   */
  at: CourtPoint | null;
};

export const PACE_LEVELS = ["slow", "normal", "fast"] as const;
export type Pace = (typeof PACE_LEVELS)[number];

export const THREE_POINT_FOCUS_LEVELS = ["low", "normal", "high"] as const;
export type ThreePointFocus = (typeof THREE_POINT_FOCUS_LEVELS)[number];

export const DEFENSE_STYLES = ["balanced", "perimeter", "interior"] as const;
export type DefenseStyle = (typeof DEFENSE_STYLES)[number];

/** Coaching choices that feed the game simulation. */
export type TeamStrategy = {
  pace: Pace;
  threePointFocus: ThreePointFocus;
  defense: DefenseStyle;
};

export const DEFAULT_TEAM_STRATEGY: Readonly<TeamStrategy> = {
  pace: "normal",
  threePointFocus: "normal",
  defense: "balanced",
};
