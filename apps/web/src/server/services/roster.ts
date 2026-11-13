import "server-only";
import { ROSTER_LIMITS } from "@fullcourt/game-rules";
import type { Position } from "@fullcourt/game-types";
import type {
  AiAssistResponse,
  OffseasonPlayer,
  RosterMoveRequest,
  RosterResponse,
  UpdateAiAssistRequest,
} from "@fullcourt/validation";
import {
  releasePlayer,
  setAiAssist,
  signPlayer,
} from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { ownedTeams } from "./offseason-data";
import { REPORT_COLUMNS } from "./offseason";
import { latestSeason } from "./season-shared";

/**
 * The owner's roster moves (release and sign) and AI Assist switches
 * (docs/DESIGN.md, "AI Assist"). Moves are open from free agency to the end of
 * the preseason; a signing has no cost yet (contracts come later).
 */

const FREE_AGENTS_SHOWN = 40;

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  team_id: string | null;
};

const view = (p: Row): OffseasonPlayer => ({
  id: p.id,
  name: `${p.first_name} ${p.last_name}`,
  position: p.position as Position,
  age: p.age,
  overall: p.overall,
  potential: p.potential,
  teamId: p.team_id,
});

/** The team to act for: the one asked for if the user runs it, else their first. */
async function resolveTeam(
  ctx: UserContext,
  leagueId: string,
  teamId: string | undefined,
): Promise<string | null> {
  const owned = await ownedTeams(ctx, leagueId);
  if (teamId === undefined) return owned[0]?.id ?? null;
  if (!owned.some((t) => t.id === teamId)) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  return teamId;
}

/** One of your rosters and the best free agents. */
export async function getRoster(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<RosterResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [teamId, season] = await Promise.all([
    resolveTeam(ctx, league.id, teamParam),
    latestSeason(ctx, league.id),
  ]);
  const [roster, free] = await Promise.all([
    teamId
      ? ctx.supabase
          .from("players")
          .select(REPORT_COLUMNS)
          .eq("league_id", league.id)
          .eq("team_id", teamId)
          .eq("status", "active")
          .order("overall", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    ctx.supabase
      .from("players")
      .select(REPORT_COLUMNS, { count: "exact" })
      .eq("league_id", league.id)
      .eq("status", "active")
      .is("team_id", null)
      .order("overall", { ascending: false })
      .order("id")
      .limit(FREE_AGENTS_SHOWN),
  ]);
  if (roster.error) throw roster.error;
  if (free.error) throw free.error;
  return {
    teamId,
    open:
      season?.phase === "offseason" &&
      ["free-agency", "training-camp", "preseason"].includes(
        season.stage ?? "",
      ),
    min: ROSTER_LIMITS.min,
    max: ROSTER_LIMITS.max,
    players: (roster.data as Row[]).map(view),
    freeAgents: (free.data as Row[]).map(view),
    freeAgentTotal: free.count ?? free.data.length,
  };
}

function refusal(error: unknown): never {
  const message = (error as { message?: string }).message;
  const known: Record<string, [number, string]> = {
    wrong_stage: [
      409,
      "Players can be signed and released from free agency to the end of the preseason.",
    ],
    roster_full: [409, "A roster holds at most 15 players."],
    player_not_available: [409, "That player isn't a free agent."],
    player_not_found: [404, "That player isn't on your roster."],
  };
  const hit = message ? known[message] : undefined;
  if (hit) throw new ApiError(hit[0], message as string, hit[1]);
  throw error;
}

async function seasonForMoves(ctx: UserContext, leagueId: string) {
  const season = await latestSeason(ctx, leagueId);
  if (!season || season.phase !== "offseason") {
    throw new ApiError(
      409,
      "wrong_stage",
      "Players can be signed and released from free agency to the end of the preseason.",
    );
  }
  return season;
}

/** Signs a free agent onto your roster. */
export async function signFreeAgent(
  ctx: UserContext,
  leagueIdParam: string,
  input: RosterMoveRequest,
): Promise<RosterResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveTeam(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  const season = await seasonForMoves(ctx, league.id);
  try {
    await signPlayer({ seasonId: season.id, teamId, playerId: input.playerId });
  } catch (error) {
    refusal(error);
  }
  return getRoster(ctx, league.id, teamId);
}

/** Releases a player from your roster into free agency. */
export async function releaseFromRoster(
  ctx: UserContext,
  leagueIdParam: string,
  input: RosterMoveRequest,
): Promise<RosterResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveTeam(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  const season = await seasonForMoves(ctx, league.id);
  try {
    await releasePlayer({
      seasonId: season.id,
      teamId,
      playerId: input.playerId,
    });
  } catch (error) {
    refusal(error);
  }
  return getRoster(ctx, league.id, teamId);
}

/** Switches AI Assist on or off for a franchise you run. */
export async function updateAiAssist(
  ctx: UserContext,
  leagueIdParam: string,
  input: UpdateAiAssistRequest,
): Promise<AiAssistResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveTeam(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  await setAiAssist(teamId, input.aiAssist as Record<string, boolean>);
  const team = (await ownedTeams(ctx, league.id)).find((t) => t.id === teamId);
  return { teamId, aiAssist: (team as NonNullable<typeof team>).assist };
}
