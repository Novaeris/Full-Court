import { simulateDay } from "@fullcourt/game-engine";
import {
  CommitRefused,
  CommitRejected,
  type SimJobRow,
  type WorkerDb,
} from "./db";
import {
  toDbLine,
  toDbPlay,
  toDbResult,
  toEngineGame,
  toRngState,
  toSimTeams,
} from "./map";

export type Log = (message: string) => void;

/**
 * Plays a claimed job: one day at a time, each committed in its own database
 * transaction, until the job's days are done.
 *
 * - If the database refuses a day because the job was cancelled, requeued or
 *   already advanced, the worker stops quietly; the days already committed stay.
 * - If the data can't be simulated (a team with too few players, a bad RNG
 *   state), the job is marked failed with the reason. Retrying wouldn't help.
 * - Database or network errors are thrown to the caller and the job is left
 *   running: its heartbeat goes stale and it is requeued, resuming at the next
 *   uncommitted day.
 */
export async function runJob(
  db: WorkerDb,
  job: SimJobRow,
  log: Log = () => {},
): Promise<void> {
  let current = job;
  while (
    current.status === "running" &&
    current.days_done < current.days_requested
  ) {
    const season = await db.loadSeason(current.season_id);
    if (season.phase !== "regular-season") {
      await db.failJob(current.id, "The regular season is over.");
      log(`job ${current.id}: season is over, stopped`);
      return;
    }

    const day = season.day;
    const rows = await db.loadDay(season, day);

    let commit;
    try {
      const result = simulateDay({
        games: rows.games.map(toEngineGame),
        teams: toSimTeams(rows.games, rows.players),
        rngState: toRngState(rows.rngState),
      });
      commit = {
        jobId: current.id,
        day,
        rngState: [...result.rngState],
        games: result.games.map(toDbResult),
        plays: result.plays.map(toDbPlay),
        lines: result.boxScores.flatMap((b) => b.lines.map(toDbLine)),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.failJob(
        current.id,
        `Day ${day} could not be simulated: ${message}`,
      );
      log(`job ${current.id}: failed on day ${day}: ${message}`);
      return;
    }

    try {
      current = await db.commitDay(commit);
    } catch (error) {
      if (error instanceof CommitRefused) {
        log(`job ${current.id}: stopped (${error.reason})`);
        return;
      }
      if (error instanceof CommitRejected) {
        await db.failJob(
          current.id,
          `Day ${day} was rejected by the database: ${error.message}`,
        );
        log(`job ${current.id}: day ${day} rejected: ${error.message}`);
        return;
      }
      throw error;
    }
    log(
      `job ${current.id}: day ${day} committed (${current.days_done}/${current.days_requested})`,
    );
  }
}
