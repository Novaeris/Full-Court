import type { Database } from "@fullcourt/api-client";
import type { AllStarStore } from "./all-star";
import type { TradeStore } from "./trade-round";

export type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
export type SimJobRow = Database["public"]["Tables"]["sim_jobs"]["Row"];
export type GameRow = Database["public"]["Tables"]["games"]["Row"];
export type PlayerRow = Pick<
  Database["public"]["Tables"]["players"]["Row"],
  | "id"
  | "team_id"
  | "position"
  | "overall"
  | "inside"
  | "mid_range"
  | "three_point"
  | "free_throw"
  | "passing"
  | "ball_handling"
  | "off_rebound"
  | "def_rebound"
  | "perimeter_d"
  | "interior_d"
  | "speed"
  | "strength"
  | "stamina"
  | "injury_days"
>;

/** How a team plays: its strategy and the starters its owner named. */
export type CoachRow = {
  id: string;
  strategy_pace: string;
  strategy_three_point: string;
  strategy_defense: string;
  starters: string[];
  /** How many players the coach uses, or null for everyone. */
  rotation_size: number | null;
  /** The owner's slot; null for a computer team, which picks its own style. */
  local_player_slot: number | null;
};

/** A team's head coach, whose rating adds to every player in its games. */
export type HeadCoachRow = { team_id: string; rating: number };

/** What a day needs from the database. */
export type DayRows = {
  /** The league's RNG state before the day. */
  rngState: number[];
  /** The day's games that are still scheduled. */
  games: GameRow[];
  /** Every player on a team that plays that day. */
  players: PlayerRow[];
  /** The playing teams' strategies; a team missing here plays the default. */
  coaches?: CoachRow[];
  /** The playing teams' head coaches; a team missing here has none. */
  headCoaches?: HeadCoachRow[];
};

/** Rows for `admin_commit_sim_day`, in the snake_case the function expects. */
export type DayCommit = {
  jobId: string;
  day: number;
  rngState: number[];
  games: {
    id: string;
    home_score: number;
    away_score: number;
    overtimes: number;
  }[];
  replays: Record<string, unknown>[];
  lines: Record<string, unknown>[];
};

/**
 * Why the database refused a day. `job_not_running`: the owner cancelled it, or
 * it was requeued. `stale_day`: another worker already committed that day.
 */
export class CommitRefused extends Error {
  readonly reason: "job_not_running" | "stale_day";
  constructor(reason: CommitRefused["reason"]) {
    super(`The database refused the day: ${reason}`);
    this.name = "CommitRefused";
    this.reason = reason;
  }
}

/**
 * The database rejected a day's data (a constraint, or a check inside the commit
 * function). Retrying the same data can't succeed, so the job fails with the reason.
 */
export class CommitRejected extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "CommitRejected";
  }
}

/** An injury to store: who is hurt, for how many days, and with what. */
export type StoredInjury = {
  player_id: string;
  team_id: string;
  days: number;
  kind: string;
};

/** Everything the worker does to the database, so the job logic can be tested without one. */
export interface WorkerDb extends Partial<TradeStore>, Partial<AllStarStore> {
  claimJob(worker: string): Promise<SimJobRow | null>;
  requeueStale(maxAgeMs: number): Promise<number>;
  loadSeason(id: string): Promise<SeasonRow>;
  loadDay(season: SeasonRow, day: number): Promise<DayRows>;
  commitDay(input: DayCommit): Promise<SimJobRow>;
  failJob(jobId: string, message: string): Promise<void>;
  /** Heals a day and stores that day's new injuries (once for each day). */
  applyInjuries?(
    seasonId: string,
    day: number,
    injuries: StoredInjury[],
  ): Promise<void>;
}
