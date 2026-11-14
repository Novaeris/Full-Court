import "server-only";
import {
  AWARD_NAMES,
  RACE_AWARDS,
  awardLines,
  awardRace,
  type StatRow,
} from "@fullcourt/game-rules";
import type { AwardRaceResponse } from "@fullcourt/validation";
import type { UserContext } from "@/server/auth/session";
import { efficiencyOf } from "./awards";
import { getLeague, parseLeagueId } from "./leagues";
import { allRows } from "./offseason-data";
import { latestSeason } from "./season-shared";

/**
 * The award race (docs/DESIGN.md, "The award race"): who leads each of the
 * season's main awards on the games played so far. It uses the rules the
 * season's awards use, on the season's totals to date, so the race ends on the
 * winner. Nothing is stored.
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
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
};

/** How many candidates each race lists. */
const LEADERS = 5;

export async function getAwardRace(
  ctx: UserContext,
  leagueIdParam: string,
): Promise<AwardRaceResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = await latestSeason(ctx, league.id);
  if (!season) return { season: null, games: 0, races: [] };

  const [totals, games, earlier, teams] = await Promise.all([
    ctx.supabase
      .rpc("player_season_totals", {
        target_season: season.id,
        playoffs: false,
      })
      .range(0, 4999),
    allRows((from, to) =>
      ctx.supabase
        .from("games")
        .select("home_team_id, away_team_id, home_score, away_score")
        .eq("league_id", league.id)
        .eq("season_id", season.id)
        .eq("status", "final")
        .is("series_id", null)
        .order("id")
        .range(from, to),
    ),
    ctx.supabase
      .from("seasons")
      .select("id")
      .eq("league_id", league.id)
      .eq("year", season.year - 1)
      .not("archived_at", "is", null)
      .maybeSingle(),
    ctx.supabase.from("teams").select("id").eq("league_id", league.id),
  ]);
  if (totals.error) throw totals.error;
  if (earlier.error) throw earlier.error;
  if (teams.error) throw teams.error;

  const rows: StatRow[] = (totals.data as unknown as Totals[]).map((r) => ({
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
    fgm: r.fgm,
    fga: r.fga,
    ftm: r.ftm,
    fta: r.fta,
  }));
  const played = Math.max(0, ...rows.map((r) => r.games));
  if (played === 0) return { season: null, games: 0, races: [] };

  // Who is a rookie and where each plays.
  const ids = [...new Set(rows.map((r) => r.playerId))];
  const info = new Map<string, { position: string; rookie: boolean }>();
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await ctx.supabase
      .from("players")
      .select("id, first_name, last_name, position, draft_year")
      .eq("league_id", league.id)
      .in("id", ids.slice(i, i + 150));
    if (error) throw error;
    for (const p of data) {
      info.set(p.id, {
        position: p.position,
        rookie: p.draft_year === season.year,
      });
      names.set(p.id, `${p.first_name} ${p.last_name}`);
    }
  }

  // Each team's record and points allowed in the regular season so far.
  const record = new Map(
    teams.data.map((t) => [
      t.id,
      { id: t.id, wins: 0, losses: 0, pointsAgainst: 0 },
    ]),
  );
  for (const g of games) {
    const home = record.get(String(g.home_team_id));
    const away = record.get(String(g.away_team_id));
    const h = Number(g.home_score);
    const a = Number(g.away_score);
    if (home) {
      home.pointsAgainst += a;
      if (h > a) home.wins += 1;
      else home.losses += 1;
    }
    if (away) {
      away.pointsAgainst += h;
      if (a > h) away.wins += 1;
      else away.losses += 1;
    }
  }

  const previous = earlier.data
    ? await efficiencyOf(ctx, league.id, earlier.data.id)
    : new Map<string, number>();
  const input = {
    lines: awardLines(rows, info),
    teams: [...record.values()],
    previous,
    champion: null,
    finalsLines: [],
  };
  const round = (n: number) => Math.round(n * 10) / 10;

  return {
    season: { year: season.year, day: season.day, phase: season.phase },
    games: played,
    races: RACE_AWARDS.map((award) => ({
      award,
      label: AWARD_NAMES[award] ?? award,
      candidates: awardRace(input, award, LEADERS).map(
        ({ line, score }, i) => ({
          rank: i + 1,
          playerId: line.playerId,
          name: names.get(line.playerId) ?? "Unknown",
          position: line.position,
          teamId: line.teamId,
          games: line.games,
          points: round(line.points / line.games),
          rebounds: round(line.rebounds / line.games),
          assists: round(line.assists / line.games),
          score: round(score),
        }),
      ),
    })),
  };
}
