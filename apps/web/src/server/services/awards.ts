import "server-only";
import {
  awardLines,
  chooseAwards,
  efficiency,
  type StatRow,
} from "@fullcourt/game-rules";
import { setSeasonAwards } from "@/server/admin/season";
import type { UserContext } from "@/server/auth/session";
import { allRows } from "./offseason-data";
import type { SeasonRow } from "./season-shared";

/**
 * Works out a season's awards from its archived totals and stores them
 * (docs/DESIGN.md, "Awards and history"). It runs once the season is archived
 * and can run again: the awards it stores replace the earlier ones.
 */

const STAT_COLUMNS =
  "player_id, team_id, playoffs, games_played, games_started, minutes, points, rebounds, assists, steals, blocks, turnovers, fgm, fga, ftm, fta";

type Stat = {
  player_id: string;
  team_id: string;
  playoffs: boolean;
  games_played: number;
  games_started: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
};

const toStatRow = (s: Stat): StatRow => ({
  playerId: s.player_id,
  teamId: s.team_id,
  games: s.games_played,
  started: s.games_started,
  minutes: s.minutes,
  points: s.points,
  rebounds: s.rebounds,
  assists: s.assists,
  steals: s.steals,
  blocks: s.blocks,
  turnovers: s.turnovers,
  fgm: s.fgm,
  fga: s.fga,
  ftm: s.ftm,
  fta: s.fta,
});

async function statsOf(
  ctx: UserContext,
  leagueId: string,
  seasonId: string,
): Promise<Stat[]> {
  return (await allRows((from, to) =>
    ctx.supabase
      .from("player_season_stats")
      .select(STAT_COLUMNS)
      .eq("league_id", leagueId)
      .eq("season_id", seasonId)
      .order("player_id")
      .order("team_id")
      .order("playoffs")
      .range(from, to),
  )) as unknown as Stat[];
}

/** Each player's efficiency per game in a season's regular season. */
export async function efficiencyOf(
  ctx: UserContext,
  leagueId: string,
  seasonId: string,
): Promise<Map<string, number>> {
  const rows = (await statsOf(ctx, leagueId, seasonId))
    .filter((r) => !r.playoffs)
    .map(toStatRow);
  const out = new Map<string, number>();
  for (const l of awardLines(
    rows,
    new Map(rows.map((r) => [r.playerId, { position: "", rookie: false }])),
  )) {
    out.set(l.playerId, efficiency(l));
  }
  return out;
}

/** Computes and stores the awards of an archived season; returns how many. */
export async function awardSeason(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
): Promise<number> {
  const [rows, teams, champion, earlier] = await Promise.all([
    statsOf(ctx, leagueId, season.id),
    ctx.supabase
      .from("team_season_stats")
      .select("team_id, wins, losses, points_against")
      .eq("league_id", leagueId)
      .eq("season_id", season.id),
    ctx.supabase
      .from("season_awards")
      .select("team_id")
      .eq("season_id", season.id)
      .eq("award", "champion")
      .maybeSingle(),
    ctx.supabase
      .from("seasons")
      .select("id")
      .eq("league_id", leagueId)
      .eq("year", season.year - 1)
      .not("archived_at", "is", null)
      .maybeSingle(),
  ]);
  if (teams.error) throw teams.error;
  if (champion.error) throw champion.error;
  if (earlier.error) throw earlier.error;
  if (rows.length === 0) return 0;

  // Who is a rookie and where each plays: from the players themselves.
  const ids = [...new Set(rows.map((r) => r.player_id))];
  const info = new Map<string, { position: string; rookie: boolean }>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await ctx.supabase
      .from("players")
      .select("id, position, draft_year")
      .eq("league_id", leagueId)
      .in("id", ids.slice(i, i + 150));
    if (error) throw error;
    for (const p of data) {
      info.set(p.id, {
        position: p.position,
        rookie: p.draft_year === season.year,
      });
    }
  }

  const regular = rows.filter((r) => !r.playoffs).map(toStatRow);
  const championId = champion.data?.team_id ?? null;
  const finals = rows
    .filter((r) => r.playoffs && r.team_id === championId)
    .map(toStatRow);

  // Last season's efficiency, for the most improved player.
  const previous = earlier.data
    ? await efficiencyOf(ctx, leagueId, earlier.data.id)
    : new Map<string, number>();

  const winners = chooseAwards({
    lines: awardLines(regular, info),
    teams: teams.data.map((t) => ({
      id: t.team_id,
      wins: t.wins,
      losses: t.losses,
      pointsAgainst: t.points_against,
    })),
    previous,
    champion: championId,
    finalsLines: awardLines(finals, info),
  });
  await setSeasonAwards({
    seasonId: season.id,
    awards: winners.map((w) => ({
      award: w.award,
      player_id: w.playerId,
      team_id: w.teamId,
    })),
  });
  return winners.length;
}
