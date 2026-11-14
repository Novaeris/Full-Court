import "server-only";
import { statLeaders, type StatTotals } from "@fullcourt/game-rules";
import type { StatsResponse } from "@fullcourt/validation";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { latestSeason } from "./season-shared";

/**
 * Statistics for the season being played (docs/DESIGN.md, "Statistics"): the
 * league's leaders, and one player's season line and recent games. Everything is
 * added up from the box score lines, which are kept for the current season only;
 * past seasons live in the history tables.
 */

type Totals = {
  player_id: string;
  team_id: string;
  games: number;
  started: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
};

const toTotals = (r: Totals): StatTotals => ({
  playerId: r.player_id,
  teamId: r.team_id,
  games: r.games,
  started: r.started,
  minutes: r.minutes,
  points: r.points,
  rebounds: r.rebounds,
  assists: r.assists,
  steals: r.steals,
  blocks: r.blocks,
  turnovers: r.turnovers,
  fouls: r.fouls,
  fgm: r.fgm,
  fga: r.fga,
  tpm: r.tpm,
  tpa: r.tpa,
  ftm: r.ftm,
  fta: r.fta,
});

/** The league's leaders for the regular season, or for the playoffs. */
export async function getStats(
  ctx: UserContext,
  leagueIdParam: string,
  playoffs = false,
): Promise<StatsResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = await latestSeason(ctx, league.id);
  if (!season) return { season: null, playoffs, games: 0, boards: [] };

  const { data, error } = await ctx.supabase
    .rpc("player_season_totals", {
      target_season: season.id,
      playoffs,
    })
    .range(0, 4999);
  if (error) throw error;
  const rows = (data as unknown as Totals[]).map(toTotals);
  const boards = statLeaders(rows, 10);

  const wanted = [
    ...new Set(boards.flatMap((b) => b.leaders.map((l) => l.playerId))),
  ];
  const people = new Map<string, { name: string; position: string }>();
  for (let i = 0; i < wanted.length; i += 150) {
    const found = await ctx.supabase
      .from("players")
      .select("id, first_name, last_name, position")
      .eq("league_id", league.id)
      .in("id", wanted.slice(i, i + 150));
    if (found.error) throw found.error;
    for (const p of found.data) {
      people.set(p.id, {
        name: `${p.first_name} ${p.last_name}`,
        position: p.position,
      });
    }
  }

  return {
    season: { year: season.year, day: season.day, phase: season.phase },
    playoffs,
    games: Math.max(0, ...rows.map((r) => r.games)),
    boards: boards.map((b) => ({
      id: b.id,
      label: b.label,
      unit: b.unit,
      leaders: b.leaders.map((l, i) => ({
        rank: i + 1,
        playerId: l.playerId,
        name: people.get(l.playerId)?.name ?? "Unknown",
        position: people.get(l.playerId)?.position ?? "",
        teamId: l.teamId,
        games: l.games,
        value: l.value,
        total: l.total,
      })),
    })),
  };
}

/** One player's line for the season so far, and his latest games. */
export type PlayerSeason = {
  year: number;
  regular: Line | null;
  playoffs: Line | null;
  recent: {
    gameId: string;
    day: number;
    playoff: boolean;
    opponentId: string;
    home: boolean;
    won: boolean;
    score: string;
    minutes: number;
    points: number;
    rebounds: number;
    assists: number;
  }[];
};

export type Line = {
  games: number;
  started: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
};

const empty = (): Line => ({
  games: 0,
  started: 0,
  minutes: 0,
  points: 0,
  rebounds: 0,
  assists: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  fgm: 0,
  fga: 0,
  tpm: 0,
  tpa: 0,
  ftm: 0,
  fta: 0,
});

export async function getPlayerSeason(
  ctx: UserContext,
  leagueId: string,
  playerId: string,
): Promise<PlayerSeason | null> {
  const season = await latestSeason(ctx, leagueId);
  if (!season) return null;
  const games = await ctx.supabase
    .from("games")
    .select(
      "id, day, round, home_team_id, away_team_id, home_score, away_score",
    )
    .eq("league_id", leagueId)
    .eq("season_id", season.id)
    .eq("status", "final")
    .limit(1000);
  if (games.error) throw games.error;
  const lines = await ctx.supabase
    .from("box_score_lines")
    .select(
      "game_id, team_id, started, minutes, points, rebounds, assists, steals, blocks, turnovers, fgm, fga, tpm, tpa, ftm, fta",
    )
    .eq("league_id", leagueId)
    .eq("player_id", playerId)
    .limit(500);
  if (lines.error) throw lines.error;
  const gameOf = new Map(games.data.map((g) => [g.id, g]));

  const regular = empty();
  const post = empty();
  const recent: PlayerSeason["recent"] = [];
  for (const l of lines.data) {
    const g = gameOf.get(l.game_id);
    if (!g) continue;
    const sum = g.round === null ? regular : post;
    sum.games++;
    if (l.started) sum.started++;
    sum.minutes += l.minutes;
    sum.points += l.points;
    sum.rebounds += l.rebounds;
    sum.assists += l.assists;
    sum.steals += l.steals;
    sum.blocks += l.blocks;
    sum.turnovers += l.turnovers;
    sum.fgm += l.fgm;
    sum.fga += l.fga;
    sum.tpm += l.tpm;
    sum.tpa += l.tpa;
    sum.ftm += l.ftm;
    sum.fta += l.fta;
    const home = l.team_id === g.home_team_id;
    const mine = (home ? g.home_score : g.away_score) ?? 0;
    const theirs = (home ? g.away_score : g.home_score) ?? 0;
    recent.push({
      gameId: g.id,
      day: g.day,
      playoff: g.round !== null,
      opponentId: home ? g.away_team_id : g.home_team_id,
      home,
      won: mine > theirs,
      score: `${mine}-${theirs}`,
      minutes: l.minutes,
      points: l.points,
      rebounds: l.rebounds,
      assists: l.assists,
    });
  }
  recent.sort((a, b) => b.day - a.day);
  return {
    year: season.year,
    regular: regular.games > 0 ? regular : null,
    playoffs: post.games > 0 ? post : null,
    recent: recent.slice(0, 10),
  };
}
