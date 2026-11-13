import "server-only";
import type { Database } from "@fullcourt/api-client";
import { createRng, generateSchedule, seedState } from "@fullcourt/game-engine";
import { validateScheduleTiers } from "@fullcourt/game-rules";
import { DEFAULT_SCHEDULE_TIERS } from "@fullcourt/game-types";
import type {
  Season,
  SimJob,
  SimulationStatus,
  StartSimulationRequest,
} from "@fullcourt/validation";
import { insertSeason } from "@/server/admin/season";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { parseLeagueId, getLeague } from "./leagues";
import { getStructure } from "./world";

/**
 * Simulation use-cases, shared by /api/v1/leagues/:id/sim and the season
 * pages. Reads and the queue calls run as the caller under RLS; only creating
 * the first season needs the service role, and only after the caller has been
 * shown to own the league. The worker does the actual simulating.
 */

type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
type JobRow = Database["public"]["Tables"]["sim_jobs"]["Row"];

function toSeason(row: SeasonRow): Season {
  return {
    id: row.id,
    year: row.year,
    phase: row.phase as Season["phase"],
    day: row.day,
    lastDay: row.last_day,
    schedulePreset: row.schedule_preset as Season["schedulePreset"],
  };
}

function toJob(row: JobRow): SimJob {
  return {
    id: row.id,
    kind: row.kind as SimJob["kind"],
    status: row.status as SimJob["status"],
    daysRequested: row.days_requested,
    daysDone: row.days_done,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

async function latestSeason(
  ctx: UserContext,
  leagueId: string,
): Promise<SeasonRow | null> {
  const { data, error } = await ctx.supabase
    .from("seasons")
    .select("*")
    .eq("league_id", leagueId)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The league's current season and its latest simulation job. */
export async function getSimulation(
  ctx: UserContext,
  leagueId: string,
): Promise<SimulationStatus> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  const [season, job] = await Promise.all([
    latestSeason(ctx, league.id),
    ctx.supabase
      .from("sim_jobs")
      .select("*")
      .eq("league_id", league.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (job.error) throw job.error;
  return {
    season: season ? toSeason(season) : null,
    job: job.data ? toJob(job.data) : null,
  };
}

/**
 * Creates the league's first season when it has none: the schedule for the
 * default preset, built from the league's own structure. The schedule's RNG
 * is seeded from the league id and year, so it never disturbs the league's
 * simulation RNG and the same league always gets the same schedule.
 */
async function ensureSeason(
  ctx: UserContext,
  league: { id: string; createdAt: string },
): Promise<void> {
  if (await latestSeason(ctx, league.id)) return;

  const tiers = DEFAULT_SCHEDULE_TIERS;
  const structure = await getStructure(ctx, league.id);
  const problems = validateScheduleTiers(structure, tiers);
  if (problems.length > 0) {
    throw new ApiError(
      422,
      "schedule_not_supported",
      "This league's structure can't be given an even schedule.",
    );
  }
  const { data: teams, error } = await ctx.supabase
    .from("teams")
    .select("id, conference_id, division_id")
    .eq("league_id", league.id);
  if (error) throw error;

  const year = new Date(league.createdAt).getUTCFullYear();
  const games = generateSchedule(
    {
      structure,
      teams: teams.map((t) => ({
        teamId: t.id,
        conferenceId: t.conference_id,
        divisionId: t.division_id,
      })),
      tiers,
    },
    createRng(seedState(`${league.id}:schedule:${year}`)),
  );

  try {
    await insertSeason({
      leagueId: league.id,
      year,
      preset: "standard",
      tiers,
      games,
    });
  } catch (e) {
    // Two requests can race to create the first season: the loser is fine.
    if ((e as { code?: string }).code !== "23505") throw e;
  }
}

/** Queues a simulation of a day, a week or the rest of the regular season. */
export async function startSimulation(
  ctx: UserContext,
  leagueId: string,
  input: StartSimulationRequest,
): Promise<SimJob> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  if (league.status !== "active") {
    throw new ApiError(
      409,
      "league_not_active",
      "Choose your team before simulating.",
    );
  }
  await ensureSeason(ctx, league);

  const { data, error } = await ctx.supabase.rpc("enqueue_sim_job", {
    target_league: league.id,
    sim_kind: input.kind,
  });
  if (error) {
    switch (error.message) {
      case "league_not_found":
        throw new ApiError(
          404,
          "league_not_found",
          "That league doesn't exist.",
        );
      case "league_not_active":
        throw new ApiError(
          409,
          "league_not_active",
          "Choose your team before simulating.",
        );
      case "season_not_found":
        throw new ApiError(
          404,
          "season_not_found",
          "This league has no season.",
        );
      case "season_not_running":
        throw new ApiError(
          409,
          "season_not_running",
          "The regular season is over.",
        );
      case "job_already_running":
        throw new ApiError(
          409,
          "job_already_running",
          "A simulation is already running for this league.",
        );
      default:
        throw error;
    }
  }
  return toJob(data);
}

/** Cancels the league's queued or running simulation. Days already played stay. */
export async function cancelSimulation(
  ctx: UserContext,
  leagueId: string,
): Promise<SimJob> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  const { data: active, error: findError } = await ctx.supabase
    .from("sim_jobs")
    .select("id")
    .eq("league_id", league.id)
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (findError) throw findError;
  if (!active) {
    throw new ApiError(
      404,
      "job_not_found",
      "There is no simulation to cancel.",
    );
  }
  const { data, error } = await ctx.supabase.rpc("cancel_sim_job", {
    target_job: active.id,
  });
  if (error) {
    if (error.message === "job_not_found") {
      throw new ApiError(
        404,
        "job_not_found",
        "There is no simulation to cancel.",
      );
    }
    throw error;
  }
  return toJob(data);
}
