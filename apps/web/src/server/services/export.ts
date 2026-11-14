import "server-only";
import type { LeagueExport } from "@fullcourt/validation";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { allRows, type Row } from "./offseason-data";

/**
 * A backup of a league (docs/DESIGN.md, "League backup and restore"): the
 * league and every table that belongs to it, as the database holds them. Read
 * as the caller, so only their own leagues can be exported. The same document
 * is what restoring a backup (`admin_import_league`) takes.
 */

/** The version of the file's layout. Bump it when a table or a field's meaning changes. */
export const EXPORT_FORMAT = 2;

/**
 * Each table, with the columns that give it a stable order (its key), so
 * pages never repeat or skip a row. Parents come before the rows that point
 * at them, which is the order a restore writes them in.
 */
export const EXPORT_TABLES = {
  league_conferences: ["id"],
  league_divisions: ["id"],
  league_local_players: ["slot"],
  teams: ["id"],
  players: ["id"],
  seasons: ["id"],
  playoff_series: ["id"],
  games: ["id"],
  game_replays: ["game_id"],
  box_score_lines: ["game_id", "player_id"],
  player_season_stats: ["season_id", "player_id", "team_id", "playoffs"],
  team_season_stats: ["season_id", "team_id"],
  season_awards: ["id"],
  draft_picks: ["season_year", "pick"],
  player_ratings_history: ["player_id", "season_year"],
  staff_members: ["id"],
  camp_assignments: ["season_id", "player_id"],
  camp_results: ["season_year", "player_id"],
  fa_offers: ["id"],
  player_transactions: ["id"],
  trades: ["id"],
  trade_offers: ["id"],
  pick_rights: ["id"],
  player_injuries: ["id"],
  all_star_games: ["id"],
  all_star_players: ["game_id", "player_id"],
} as const;

type TableName = keyof typeof EXPORT_TABLES;

async function table(
  ctx: UserContext,
  name: TableName,
  leagueId: string,
): Promise<Row[]> {
  return allRows((from, to) => {
    let query = ctx.supabase.from(name).select("*").eq("league_id", leagueId);
    for (const column of EXPORT_TABLES[name]) {
      query = query.order(column as "id");
    }
    return query.range(from, to);
  });
}

export async function exportLeague(
  ctx: UserContext,
  leagueIdParam: string,
): Promise<LeagueExport> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  // The league's own row, for what the public League shape leaves out.
  const row = await ctx.supabase
    .from("leagues")
    .select("*")
    .eq("id", league.id)
    .single();
  if (row.error) throw row.error;
  const names = Object.keys(EXPORT_TABLES) as TableName[];
  const rows = await Promise.all(names.map((n) => table(ctx, n, league.id)));
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    league: row.data,
    tables: Object.fromEntries(names.map((n, i) => [n, rows[i] ?? []])),
  };
}
