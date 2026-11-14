import "server-only";
import { headToHead, type FinishedGame } from "@fullcourt/game-rules";
import type { HeadToHeadResponse } from "@fullcourt/validation";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { allRows } from "./offseason-data";

/**
 * A team's record against every opponent (docs/DESIGN.md, "Head to head"),
 * from all the league's finished games of every season. Nothing is stored.
 */
export async function getHeadToHead(
  ctx: UserContext,
  leagueIdParam: string,
  teamId: string,
): Promise<HeadToHeadResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const team = await ctx.supabase
    .from("teams")
    .select("id")
    .eq("league_id", league.id)
    .eq("id", teamId)
    .maybeSingle();
  if (team.error) throw team.error;
  if (!team.data) {
    throw new ApiError(
      404,
      "team_not_found",
      "That team isn't in this league.",
    );
  }
  const [rows, seasons] = await Promise.all([
    allRows((from, to) =>
      ctx.supabase
        .from("games")
        .select(
          "season_id, day, series_id, home_team_id, away_team_id, home_score, away_score",
        )
        .eq("league_id", league.id)
        .eq("status", "final")
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order("id")
        .range(from, to),
    ),
    ctx.supabase.from("seasons").select("id, year").eq("league_id", league.id),
  ]);
  if (seasons.error) throw seasons.error;
  const yearOf = new Map(seasons.data.map((s) => [s.id, s.year]));
  const games: FinishedGame[] = rows.map((g) => ({
    home: String(g.home_team_id),
    away: String(g.away_team_id),
    homeScore: Number(g.home_score),
    awayScore: Number(g.away_score),
    playoff: g.series_id !== null,
    year: yearOf.get(String(g.season_id)) ?? 0,
    day: Number(g.day),
  }));
  return { teamId, opponents: headToHead(games, teamId) };
}
