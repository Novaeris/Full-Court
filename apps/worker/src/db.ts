import type { Database } from "@fullcourt/api-client";

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
>;

/** What a day needs from the database. */
export type DayRows = {
  /** The league's RNG state before the day. */
  rngState: number[];
  /** The day's games that are still scheduled. */
  games: GameRow[];
  /** Every player on a team that plays that day. */
  players: PlayerRow[];
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
  plays: Record<string, unknown>[];
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

/** Everything the worker does to the database, so the job logic can be tested without one. */
export interface WorkerDb {
  claimJob(worker: string): Promise<SimJobRow | null>;
  requeueStale(maxAgeMs: number): Promise<number>;
  loadSeason(id: string): Promise<SeasonRow>;
  loadDay(season: SeasonRow, day: number): Promise<DayRows>;
  commitDay(input: DayCommit): Promise<SimJobRow>;
  failJob(jobId: string, message: string): Promise<void>;
}
