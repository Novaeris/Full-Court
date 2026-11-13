import {
  replayGame,
  simulateDay,
  type ReplaySnapshot,
  type SimulateDayResult,
} from "@fullcourt/game-engine";
import type { Game } from "@fullcourt/game-types";
import {
  CommitRefused,
  CommitRejected,
  type SimJobRow,
  type WorkerDb,
} from "./db";
import {
  toDbLine,
  toDbReplay,
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
    if (season.phase === "complete") {
      await db.failJob(current.id, "The season is over.");
      log(`job ${current.id}: season is over, stopped`);
      return;
    }

    const day = season.day;
    const rows = await db.loadDay(season, day);

    let commit;
    try {
      const games = rows.games.map(toEngineGame);
      const result = simulateDay({
        games,
        teams: toSimTeams(rows.games, rows.players),
        rngState: toRngState(rows.rngState),
      });
      verifyReplays(games, result);
      commit = {
        jobId: current.id,
        day,
        rngState: [...result.rngState],
        games: result.games.map(toDbResult),
        replays: result.replays.map(toDbReplay),
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

/**
 * Games are stored as replay recipes, not plays, so a recipe that doesn't
 * reproduce its game would silently lose it. Replay every game of the day,
 * through the same JSON round trip the database applies, and compare the plays
 * and box score with the originals. A mismatch means the snapshot is missing
 * something the engine reads: the job fails instead of storing a bad recipe.
 * Replaying costs about a millisecond a game.
 */
function verifyReplays(
  games: readonly Game[],
  result: SimulateDayResult,
): void {
  result.replays.forEach((replay, i) => {
    const game = games[i];
    if (!game || game.id !== replay.gameId) {
      throw new Error("Replays are out of step with the day's games.");
    }
    const stored = JSON.parse(JSON.stringify(replay)) as typeof replay;
    const again = replayGame(
      game,
      stored.snapshot as ReplaySnapshot,
      stored.rngState,
    );
    const plays = result.plays.filter((p) => p.gameId === game.id);
    if (
      JSON.stringify(again.plays) !== JSON.stringify(plays) ||
      JSON.stringify(again.boxScore) !== JSON.stringify(result.boxScores[i])
    ) {
      throw new Error(`The replay of game ${game.id} does not reproduce it.`);
    }
  });
}
