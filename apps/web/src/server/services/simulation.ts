import "server-only";
import type { Database } from "@fullcourt/api-client";
import type {
  SimJob,
  SimulationStatus,
  StartSimulationRequest,
} from "@fullcourt/validation";
import { ApiError } from "@/server/api/handler";
import { ensurePlayoffs } from "./playoffs";
import { ensureSeason } from "./season-create";
import { latestSeason, seasonView } from "./season-shared";
import type { UserContext } from "@/server/auth/session";
import { parseLeagueId, getLeague } from "./leagues";

/**
 * Simulation use-cases, shared by /api/v1/leagues/:id/sim and the season
 * pages. Reads and the queue calls run as the caller under RLS; only creating
 * the first season needs the service role, and only after the caller has been
 * shown to own the league. The worker does the actual simulating.
 */

type JobRow = Database["public"]["Tables"]["sim_jobs"]["Row"];

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
    season: season ? await seasonView(ctx, season) : null,
    job: job.data ? toJob(job.data) : null,
  };
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
  await ensurePlayoffs(ctx, league.id);

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
          "The season is over. Start the next one.",
        );
      case "playoffs_not_started":
        throw new ApiError(
          409,
          "playoffs_not_started",
          "The playoffs haven't been set up yet.",
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
