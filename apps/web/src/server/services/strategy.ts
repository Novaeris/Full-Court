import "server-only";
import { coachingBonus } from "@fullcourt/game-rules";
import type { Position } from "@fullcourt/game-types";
import type {
  StrategyResponse,
  UpdateStrategyRequest,
} from "@fullcourt/validation";
import { setTeamStrategy } from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { ownedTeams } from "./offseason-data";

/**
 * How your team plays (docs/DESIGN.md, "Strategy and lineups"): pace,
 * three-point focus, defence and the five starters. It can be set at any time
 * and applies to the games played after it.
 */

async function resolveOwned(
  ctx: UserContext,
  leagueId: string,
  teamParam: string | undefined,
): Promise<string | null> {
  const owned = await ownedTeams(ctx, leagueId);
  if (teamParam === undefined) return owned[0]?.id ?? null;
  if (!owned.some((t) => t.id === teamParam)) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  return teamParam;
}

/** The strategy, starters and roster of one of your teams. */
export async function getStrategy(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<StrategyResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveOwned(ctx, league.id, teamParam);
  const empty: StrategyResponse = {
    teamId: null,
    strategy: {
      pace: "normal",
      threePointFocus: "normal",
      defense: "balanced",
    },
    starters: [],
    rotation: null,
    coach: null,
    roster: [],
  };
  if (!teamId) return empty;
  const [team, players, head] = await Promise.all([
    ctx.supabase
      .from("teams")
      .select(
        "strategy_pace, strategy_three_point, strategy_defense, starters, rotation_size",
      )
      .eq("id", teamId)
      .single(),
    ctx.supabase
      .from("players")
      .select("id, first_name, last_name, position, overall, injury_days")
      .eq("league_id", league.id)
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("overall", { ascending: false })
      .order("id"),
    ctx.supabase
      .from("staff_members")
      .select("first_name, last_name, rating")
      .eq("league_id", league.id)
      .eq("team_id", teamId)
      .eq("role", "head-coach")
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (team.error) throw team.error;
  if (players.error) throw players.error;
  if (head.error) throw head.error;
  const onRoster = new Set(players.data.map((p) => p.id));
  return {
    teamId,
    strategy: {
      pace: team.data.strategy_pace as StrategyResponse["strategy"]["pace"],
      threePointFocus: team.data
        .strategy_three_point as StrategyResponse["strategy"]["threePointFocus"],
      defense: team.data
        .strategy_defense as StrategyResponse["strategy"]["defense"],
    },
    // A starter who has since left the team means the automatic five.
    starters: team.data.starters.every((id) => onRoster.has(id))
      ? team.data.starters
      : [],
    rotation: team.data.rotation_size,
    coach: head.data
      ? {
          name: `${head.data.first_name} ${head.data.last_name}`,
          rating: head.data.rating,
          bonus: coachingBonus(head.data.rating),
        }
      : null,
    roster: players.data.map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      position: p.position as Position,
      overall: p.overall,
      injuryDays: p.injury_days,
    })),
  };
}

/** Saves the strategy and starters for one of your teams. */
export async function updateStrategy(
  ctx: UserContext,
  leagueIdParam: string,
  input: UpdateStrategyRequest,
): Promise<StrategyResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveOwned(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  try {
    await setTeamStrategy({
      teamId,
      pace: input.strategy.pace,
      threePointFocus: input.strategy.threePointFocus,
      defense: input.strategy.defense,
      starters: input.starters,
      rotation: input.rotation,
    });
  } catch (error) {
    if ((error as { message?: string }).message === "invalid_starters") {
      throw new ApiError(
        422,
        "invalid_starters",
        "Starters have to be five different players on your roster.",
      );
    }
    throw error;
  }
  return getStrategy(ctx, leagueIdParam, teamId);
}
