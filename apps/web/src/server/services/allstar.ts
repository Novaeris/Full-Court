import "server-only";
import type { AllStarGame, AllStarResponse } from "@fullcourt/validation";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";

/**
 * A season's All-Star Game (docs/DESIGN.md, "The All-Star Game"), as the worker
 * stored it half way through the regular season. The latest one unless a year
 * is given; null while there is none.
 */
export async function getAllStar(
  ctx: UserContext,
  leagueIdParam: string,
  year?: number,
): Promise<AllStarResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const games = await ctx.supabase
    .from("all_star_games")
    .select(
      "id, season_id, day, name_a, name_b, score_a, score_b, overtimes, mvp_player_id",
    )
    .eq("league_id", league.id);
  if (games.error) throw games.error;
  if (games.data.length === 0) return { game: null };

  const seasons = await ctx.supabase
    .from("seasons")
    .select("id, year")
    .eq("league_id", league.id)
    .in(
      "id",
      games.data.map((g) => g.season_id),
    );
  if (seasons.error) throw seasons.error;
  const yearOf = new Map(seasons.data.map((s) => [s.id, s.year]));
  const wanted = games.data
    .map((g) => ({ g, year: yearOf.get(g.season_id) ?? 0 }))
    .filter((x) => year === undefined || x.year === year)
    .sort((a, b) => b.year - a.year)[0];
  if (!wanted) return { game: null };
  return { game: await toGame(ctx, league.id, wanted.g, wanted.year) };
}

type GameRow = {
  id: string;
  day: number;
  name_a: string;
  name_b: string;
  score_a: number;
  score_b: number;
  overtimes: number;
  mvp_player_id: string | null;
};

async function toGame(
  ctx: UserContext,
  leagueId: string,
  g: GameRow,
  year: number,
): Promise<AllStarGame> {
  const rows = await ctx.supabase
    .from("all_star_players")
    .select(
      "player_id, team_id, squad, starter, captain, minutes, points, rebounds, assists, steals, blocks",
    )
    .eq("game_id", g.id);
  if (rows.error) throw rows.error;
  const people = await ctx.supabase
    .from("players")
    .select("id, first_name, last_name, position")
    .eq("league_id", leagueId)
    .in(
      "id",
      rows.data.map((r) => r.player_id),
    );
  if (people.error) throw people.error;
  const who = new Map(
    people.data.map((p) => [
      p.id,
      { name: `${p.first_name} ${p.last_name}`, position: p.position },
    ]),
  );
  const squad = (id: "a" | "b") =>
    rows.data
      .filter((r) => r.squad === id)
      // Starters first, then by points.
      .sort(
        (x, y) =>
          Number(y.starter) - Number(x.starter) ||
          y.points - x.points ||
          (x.player_id < y.player_id ? -1 : 1),
      )
      .map((r) => ({
        playerId: r.player_id,
        name: who.get(r.player_id)?.name ?? "Unknown",
        position: who.get(r.player_id)?.position ?? "",
        teamId: r.team_id,
        starter: r.starter,
        captain: r.captain,
        minutes: r.minutes,
        points: r.points,
        rebounds: r.rebounds,
        assists: r.assists,
        steals: r.steals,
        blocks: r.blocks,
      }));
  return {
    year,
    day: g.day,
    overtimes: g.overtimes,
    winner: g.score_a >= g.score_b ? "a" : "b",
    mvp: g.mvp_player_id
      ? {
          playerId: g.mvp_player_id,
          name: who.get(g.mvp_player_id)?.name ?? "Unknown",
        }
      : null,
    squads: [
      { squad: "a", name: g.name_a, score: g.score_a, players: squad("a") },
      { squad: "b", name: g.name_b, score: g.score_b, players: squad("b") },
    ],
  };
}
