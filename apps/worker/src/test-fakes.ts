import {
  CommitRefused,
  type DayCommit,
  type DayRows,
  type GameRow,
  type PlayerRow,
  type SeasonRow,
  type SimJobRow,
  type StoredInjury,
  type WorkerDb,
} from "./db";

/** Four teams, each with `rosterSize` identical players. */
export function fakePlayers(rosterSize = 8): PlayerRow[] {
  const positions = ["PG", "SG", "SF", "PF", "C"] as const;
  return ["t1", "t2", "t3", "t4"].flatMap((team) =>
    Array.from({ length: rosterSize }, (_, i) => ({
      id: `${team}-p${i + 1}`,
      team_id: team,
      position: positions[i % 5] as string,
      overall: 55 + ((i * 7) % 25),
      inside: 60,
      mid_range: 58,
      three_point: 57,
      free_throw: 70,
      passing: 55,
      ball_handling: 56,
      off_rebound: 50,
      def_rebound: 52,
      perimeter_d: 55,
      interior_d: 54,
      speed: 58,
      strength: 55,
      stamina: 60 + i,
      injury_days: 0,
    })),
  );
}

const SCHEDULE: [number, string, string][] = [
  [1, "t1", "t2"],
  [1, "t3", "t4"],
  [2, "t1", "t3"],
  [2, "t2", "t4"],
  [3, "t2", "t1"],
  [3, "t4", "t3"],
];

export type FakeOptions = {
  players?: PlayerRow[];
  daysRequested?: number;
  /** Throw this when the nth (1-based) commit is attempted. */
  commitError?: { onCall: number; error: Error };
  loadDayError?: Error;
  seasonPhase?: string;
  /** Leave out `applyInjuries`, as a database without it would. */
  withInjuries?: boolean;
  injuryError?: Error;
  /** Throw on this many claims (then work normally), as a dropped connection would. */
  claimFailures?: number;
  /** Throw on this many requeue checks. */
  requeueFailures?: number;
};

/** An in-memory season, job and league that behaves like the database functions. */
export function fakeDb(options: FakeOptions = {}) {
  const season = {
    id: "season-1",
    league_id: "league-1",
    year: 2026,
    phase: options.seasonPhase ?? "regular-season",
    day: 1,
    last_day: 3,
  } as SeasonRow;
  const job = {
    id: "job-1",
    league_id: "league-1",
    season_id: season.id,
    kind: "season",
    status: "running",
    days_requested: options.daysRequested ?? 3,
    days_done: 0,
  } as SimJobRow;
  let rngState = [11, 22, 33, 44];
  const commits: DayCommit[] = [];
  const failures: { jobId: string; message: string }[] = [];
  const injuryCalls: { day: number; injuries: StoredInjury[] }[] = [];
  let claimed = false;
  let requeueCalls = 0;
  let claimsFailed = 0;
  let requeuesFailed = 0;
  let commitCalls = 0;

  const db: WorkerDb = {
    async claimJob() {
      if (claimsFailed < (options.claimFailures ?? 0)) {
        claimsFailed++;
        throw new TypeError("fetch failed");
      }
      if (claimed) return null;
      claimed = true;
      return { ...job };
    },
    async requeueStale() {
      if (requeuesFailed < (options.requeueFailures ?? 0)) {
        requeuesFailed++;
        throw new TypeError("fetch failed");
      }
      requeueCalls++;
      return 0;
    },
    async loadSeason() {
      return { ...season };
    },
    async loadDay(_season, day): Promise<DayRows> {
      if (options.loadDayError) throw options.loadDayError;
      const games = SCHEDULE.filter(([d]) => d === day).map(
        ([d, home, away], i) =>
          ({
            id: `g-${d}-${i + 1}`,
            league_id: "league-1",
            season_id: season.id,
            day: d,
            home_team_id: home,
            away_team_id: away,
            status: "scheduled",
          }) as GameRow,
      );
      return {
        rngState: [...rngState],
        games,
        players: options.players ?? fakePlayers(),
      };
    },
    async commitDay(input) {
      commitCalls++;
      if (options.commitError?.onCall === commitCalls) {
        throw options.commitError.error;
      }
      if (input.day !== season.day) throw new CommitRefused("stale_day");
      commits.push(input);
      rngState = [...input.rngState];
      season.day++;
      if (season.day > season.last_day) season.phase = "playoffs";
      job.days_done++;
      if (
        job.days_done >= job.days_requested ||
        season.phase !== "regular-season"
      ) {
        job.status = "done";
      }
      return { ...job };
    },
    async failJob(jobId, message) {
      failures.push({ jobId, message });
    },
    ...(options.withInjuries === false
      ? {}
      : {
          async applyInjuries(
            _seasonId: string,
            day: number,
            injuries: StoredInjury[],
          ) {
            if (options.injuryError) throw options.injuryError;
            injuryCalls.push({ day, injuries });
          },
        }),
  };

  return {
    db,
    job,
    season,
    commits,
    failures,
    injuryCalls,
    requeueCalls: () => requeueCalls,
  };
}
