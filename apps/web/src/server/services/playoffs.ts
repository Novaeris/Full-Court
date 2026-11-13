import "server-only";
import {
  buildFirstRound,
  roundCount,
  roundLabel,
  seedPlayoffTeams,
} from "@fullcourt/game-rules";
import type {
  GameSummary,
  PlayoffSeries,
  PlayoffsResponse,
  Season,
} from "@fullcourt/validation";
import { archiveSeason, insertPlayoffs } from "@/server/admin/season";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { runSeasonOffseason } from "./offseason";
import { getLeague, getSettings, parseLeagueId } from "./leagues";
import { createSeason } from "./season-create";
import { latestSeason, seasonView } from "./season-shared";
import { getStandings } from "./season";
import { getStructure } from "./world";

/**
 * The playoffs and the step after them. Seeding uses the standings (with the
 * tiebreakers in @fullcourt/game-rules); the database builds every later round
 * as series are won (docs/ARCHITECTURE.md, "Playoffs").
 */

/**
 * Builds the bracket once the regular season is over and it doesn't exist yet:
 * who qualifies and in what order, then the first round, which the database
 * stores and starts. Safe to call whenever; it does nothing in any other state.
 */
export async function ensurePlayoffs(
  ctx: UserContext,
  leagueId: string,
): Promise<void> {
  const season = await latestSeason(ctx, leagueId);
  if (!season || season.phase !== "playoffs") return;
  const existing = await ctx.supabase
    .from("playoff_series")
    .select("id", { count: "exact", head: true })
    .eq("season_id", season.id);
  if (existing.error) throw existing.error;
  if ((existing.count ?? 0) > 0) return;

  const [settings, standings, structure] = await Promise.all([
    getSettings(ctx, leagueId),
    getStandings(ctx, leagueId),
    getStructure(ctx, leagueId),
  ]);
  const entries = standings.rows.map((r) => ({
    teamId: r.teamId,
    conferenceId: r.conferenceId,
    divisionId: r.divisionId,
  }));
  const config = settings.playoffs;
  const pools = seedPlayoffTeams(structure, config, entries);
  const firstRound = buildFirstRound(
    pools,
    entries.map((e) => e.teamId),
    config,
  );
  try {
    await insertPlayoffs({ seasonId: season.id, config, firstRound });
  } catch (error) {
    // Two requests can race to build it: the loser is fine.
    if (
      (error as { message?: string }).message !== "playoffs_already_started"
    ) {
      throw error;
    }
  }
}

/** The bracket: every series with its teams, score and games. */
export async function getPlayoffs(
  ctx: UserContext,
  leagueId: string,
): Promise<PlayoffsResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  const row = await latestSeason(ctx, league.id);
  if (!row) return { season: null, rounds: [], series: [] };
  const season = await seasonView(ctx, row);

  const [seriesRows, gameRows] = await Promise.all([
    ctx.supabase
      .from("playoff_series")
      .select("*")
      .eq("season_id", row.id)
      .order("round")
      .order("slot"),
    ctx.supabase
      .from("games")
      .select("*")
      .eq("season_id", row.id)
      .not("series_id", "is", null)
      .order("game_number"),
  ]);
  if (seriesRows.error) throw seriesRows.error;
  if (gameRows.error) throw gameRows.error;

  const config = row.playoff_config as {
    teams?: number;
    seeding?: "conference" | "league";
  } | null;
  if (!config?.teams || seriesRows.data.length === 0) {
    return { season, rounds: [], series: [] };
  }
  const total = roundCount(config.teams);
  const rounds = Array.from({ length: total }, (_, i) => ({
    round: i + 1,
    label: roundLabel(i + 1, total, config.seeding ?? "league"),
  }));

  const gamesBySeries = new Map<string, GameSummary[]>();
  for (const g of gameRows.data) {
    if (!g.series_id) continue;
    const list = gamesBySeries.get(g.series_id) ?? [];
    list.push({
      id: g.id,
      day: g.day,
      homeTeamId: g.home_team_id,
      awayTeamId: g.away_team_id,
      status: g.status as GameSummary["status"],
      homeScore: g.home_score,
      awayScore: g.away_score,
      overtimes: g.overtimes,
      round: g.round,
      gameNumber: g.game_number,
    });
    gamesBySeries.set(g.series_id, list);
  }

  const series: PlayoffSeries[] = seriesRows.data.map((s) => ({
    id: s.id,
    round: s.round,
    slot: s.slot,
    bestOf: s.best_of,
    a: { teamId: s.team_a, seed: s.seed_a, rank: s.rank_a, wins: s.wins_a },
    b: { teamId: s.team_b, seed: s.seed_b, rank: s.rank_b, wins: s.wins_b },
    winnerTeamId: s.winner_team_id,
    games: gamesBySeries.get(s.id) ?? [],
  }));
  return { season, rounds, series };
}

/**
 * From a complete season: archives it into history (a summary of every player
 * and team, then its games are deleted) runs the offseason (players age, some retire, the draft, rosters refill)
 * and creates the next season with a new schedule.
 */
export async function startNextSeason(
  ctx: UserContext,
  leagueId: string,
): Promise<Season> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  if (league.status !== "active") {
    throw new ApiError(
      409,
      "league_not_active",
      "Choose your team before simulating.",
    );
  }
  const season = await latestSeason(ctx, league.id);
  if (!season) {
    throw new ApiError(404, "season_not_found", "This league has no season.");
  }
  if (season.phase !== "complete") {
    throw new ApiError(
      409,
      "season_not_complete",
      "The playoffs have to finish before the next season can start.",
    );
  }

  // A season whose archive already ran (a retry after a failure) only needs
  // its successor.
  const standings = await getStandings(ctx, league.id);
  const standingsOrder = standings.rows.map((r) => r.teamId);
  if (!season.archived_at) {
    await archiveSeason({ seasonId: season.id, standingsOrder });
  }
  // The offseason runs once; a retry after a failure skips it.
  await runSeasonOffseason(ctx, league.id, season, standingsOrder);
  try {
    await createSeason(ctx, league, season.year + 1);
  } catch (error) {
    if ((error as { message?: string }).message === "season_limit_reached") {
      throw new ApiError(
        409,
        "season_limit_reached",
        "A league can play up to 50 seasons.",
      );
    }
    throw error;
  }
  const next = await latestSeason(ctx, league.id);
  if (!next) throw new Error("The next season was not created.");
  return seasonView(ctx, next);
}
