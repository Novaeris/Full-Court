import "server-only";
import { CAMP_PROGRAMS, type CampProgram } from "@fullcourt/game-types";
import { CAMP_PROGRAM_INFO, campPlaces } from "@fullcourt/game-rules";
import type { CampResponse, SetCampRequest } from "@fullcourt/validation";
import { setCampRoster } from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { REPORT_COLUMNS } from "./offseason";
import { loadStaff } from "./offseason-data";
import { latestSeason } from "./season-shared";
import { resolveOwnedTeam } from "./staff";

/**
 * Training camp for the owner's team: the places the head coach earns, who is
 * going and to which program. The camp itself is held when the stage ends
 * (see offseason.ts).
 */

const programs = CAMP_PROGRAMS.map((id) => ({
  id,
  label: CAMP_PROGRAM_INFO[id].label,
  ratings: [...CAMP_PROGRAM_INFO[id].ratings],
}));

/** Your team's camp: the roster, who is going, and the places. */
export async function getCamp(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<CampResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveOwnedTeam(ctx, league.id, teamParam);
  const season = await latestSeason(ctx, league.id);
  if (!teamId) {
    return { teamId, open: false, places: 0, programs, roster: [] };
  }
  const [staff, players, saved] = await Promise.all([
    loadStaff(ctx, league.id),
    ctx.supabase
      .from("players")
      .select(REPORT_COLUMNS)
      .eq("league_id", league.id)
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("overall", { ascending: false }),
    season
      ? ctx.supabase
          .from("camp_assignments")
          .select("player_id, program")
          .eq("season_id", season.id)
          .eq("team_id", teamId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (players.error) throw players.error;
  if (saved.error) throw saved.error;
  const head = staff.find(
    (s) => s.teamId === teamId && s.role === "head-coach" && !s.retired,
  );
  const program = new Map(
    (saved.data as { player_id: string; program: string }[]).map((a) => [
      a.player_id,
      a.program as CampProgram,
    ]),
  );
  return {
    teamId,
    open: season?.phase === "offseason" && season.stage === "training-camp",
    places: campPlaces(head?.rating ?? null),
    programs,
    roster: players.data.map((p) => ({
      player: {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        position: p.position as "PG" | "SG" | "SF" | "PF" | "C",
        age: p.age,
        overall: p.overall,
        potential: p.potential,
        teamId: p.team_id,
      },
      program: program.get(p.id) ?? null,
    })),
  };
}

/** Replaces your team's camp roster. */
export async function setCamp(
  ctx: UserContext,
  leagueIdParam: string,
  input: SetCampRequest,
): Promise<CampResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveOwnedTeam(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  const season = await latestSeason(ctx, league.id);
  if (
    !season ||
    season.phase !== "offseason" ||
    season.stage !== "training-camp"
  ) {
    throw new ApiError(409, "wrong_stage", "Training camp isn't under way.");
  }
  try {
    await setCampRoster({
      seasonId: season.id,
      teamId,
      assignments: input.assignments.map((a) => ({
        player_id: a.playerId,
        program: a.program,
      })),
    });
  } catch (error) {
    const message = (error as { message?: string }).message;
    if (message === "camp_full") {
      throw new ApiError(
        422,
        "camp_full",
        "Camp doesn't have that many places.",
      );
    }
    if (message === "invalid_changes") {
      throw new ApiError(
        422,
        "invalid_changes",
        "Each player must be on your team, once.",
      );
    }
    throw error;
  }
  return getCamp(ctx, league.id, teamId);
}
