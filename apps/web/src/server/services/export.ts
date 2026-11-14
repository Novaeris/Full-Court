import "server-only";
import type { LeagueExport } from "@fullcourt/validation";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { allRows, type Row } from "./offseason-data";

/**
 * A backup of a league (docs/DESIGN.md, "League export"): everything about it
 * that the owner can see in one JSON file. Read as the caller, so only their
 * own leagues can be exported.
 */

/** The version of the file's layout. Bump it when a field's meaning changes. */
export const EXPORT_FORMAT = 1;

/** The columns that give each table a stable order, so pages never repeat or skip a row. */
const ORDER = {
  teams: ["id"],
  players: ["id"],
  seasons: ["id"],
  games: ["id"],
  season_awards: ["id"],
  player_season_stats: ["season_id", "player_id", "team_id", "playoffs"],
  draft_picks: ["season_year", "pick"],
} as const;

async function table(
  ctx: UserContext,
  name: keyof typeof ORDER,
  leagueId: string,
): Promise<Row[]> {
  return allRows((from, to) => {
    let query = ctx.supabase.from(name).select("*").eq("league_id", leagueId);
    for (const column of ORDER[name]) {
      query = query.order(column as "id");
    }
    return query.range(from, to);
  });
}

/** The row without the columns that only repeat what the file already says. */
function slim(rows: Row[]): Row[] {
  return rows.map(({ league_id: _league, ...rest }) => rest);
}

export async function exportLeague(
  ctx: UserContext,
  leagueIdParam: string,
): Promise<LeagueExport> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [teams, players, seasons, games, awards, stats, picks] =
    await Promise.all([
      table(ctx, "teams", league.id),
      table(ctx, "players", league.id),
      table(ctx, "seasons", league.id),
      table(ctx, "games", league.id),
      table(ctx, "season_awards", league.id),
      table(ctx, "player_season_stats", league.id),
      table(ctx, "draft_picks", league.id),
    ]);
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    league: { ...league },
    teams: slim(teams),
    players: slim(players),
    seasons: slim(seasons),
    games: slim(games),
    awards: slim(awards),
    playerSeasonStats: slim(stats),
    draftPicks: slim(picks),
  };
}
