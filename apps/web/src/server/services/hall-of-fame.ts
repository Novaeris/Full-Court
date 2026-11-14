import "server-only";
import {
  AWARD_NAMES,
  careerScore,
  inductionYear,
  isInducted,
  type CareerSeason,
} from "@fullcourt/game-rules";
import type { HallOfFameResponse } from "@fullcourt/validation";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { allRows } from "./offseason-data";
import { latestSeason } from "./season-shared";

/**
 * The Hall of Fame (docs/DESIGN.md, "The Hall of Fame"): retired players whose
 * careers in the league score high enough, worked out from the archived
 * records when asked (nothing is stored), best first. A player counts
 * as having won a championship if he played at least this many games for the
 * champion that season.
 */
const TITLE_GAMES = 10;

/** Players looked up at a time. */
const BATCH = 100;

type Stat = {
  player_id: string;
  season_id: string;
  team_id: string;
  games_played: number;
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

export async function getHallOfFame(
  ctx: UserContext,
  leagueIdParam: string,
): Promise<HallOfFameResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = await latestSeason(ctx, league.id);
  if (!season) return { year: null, retired: 0, members: [] };

  const retired = await allRows((from, to) =>
    ctx.supabase
      .from("players")
      .select("id, first_name, last_name, position, retired_year")
      .eq("league_id", league.id)
      .eq("status", "retired")
      .not("retired_year", "is", null)
      .order("id")
      .range(from, to),
  );
  // Only players whose waiting time has passed can be in.
  const waited = retired.filter(
    (p) => inductionYear(Number(p.retired_year)) <= season.year,
  );
  if (waited.length === 0) {
    return { year: season.year, retired: retired.length, members: [] };
  }

  const champions = await ctx.supabase
    .from("season_awards")
    .select("season_id, team_id")
    .eq("league_id", league.id)
    .eq("award", "champion");
  if (champions.error) throw champions.error;
  const championOf = new Map(
    champions.data.map((c) => [c.season_id, c.team_id]),
  );

  const stats: Stat[] = [];
  const honors = new Map<string, Record<string, number>>();
  const allStars = new Map<string, number>();
  for (let i = 0; i < waited.length; i += BATCH) {
    const ids = waited.slice(i, i + BATCH).map((p) => String(p.id));
    const [rows, awards, stars] = await Promise.all([
      allRows((from, to) =>
        ctx.supabase
          .from("player_season_stats")
          .select(
            "player_id, season_id, team_id, games_played, points, rebounds, assists, steals, blocks, turnovers, fgm, fga, ftm, fta",
          )
          .eq("league_id", league.id)
          .eq("playoffs", false)
          .in("player_id", ids)
          .order("player_id")
          .order("season_id")
          .order("team_id")
          .range(from, to),
      ),
      allRows((from, to) =>
        ctx.supabase
          .from("season_awards")
          .select("id, player_id, award")
          .eq("league_id", league.id)
          .in("player_id", ids)
          .order("id")
          .range(from, to),
      ),
      allRows((from, to) =>
        ctx.supabase
          .from("all_star_players")
          .select("game_id, player_id")
          .eq("league_id", league.id)
          .in("player_id", ids)
          .order("game_id")
          .order("player_id")
          .range(from, to),
      ),
    ]);
    stats.push(...(rows as unknown as Stat[]));
    for (const a of awards) {
      const id = String(a.player_id);
      const mine = honors.get(id) ?? {};
      mine[String(a.award)] = (mine[String(a.award)] ?? 0) + 1;
      honors.set(id, mine);
    }
    for (const s of stars) {
      const id = String(s.player_id);
      allStars.set(id, (allStars.get(id) ?? 0) + 1);
    }
  }

  const byPlayer = new Map<string, Stat[]>();
  for (const s of stats) {
    byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s]);
  }

  const members: HallOfFameResponse["members"] = [];
  for (const p of waited) {
    const id = String(p.id);
    const rows = byPlayer.get(id) ?? [];
    // A season is one line, summed over the teams he played for.
    const bySeason = new Map<string, Stat[]>();
    for (const r of rows) {
      bySeason.set(r.season_id, [...(bySeason.get(r.season_id) ?? []), r]);
    }
    const total = (list: Stat[], key: keyof Stat) =>
      list.reduce((n, r) => n + Number(r[key]), 0);
    const seasons: CareerSeason[] = [];
    let titles = 0;
    for (const [seasonId, list] of bySeason) {
      const games = total(list, "games_played");
      if (games === 0) continue;
      seasons.push({
        games,
        efficiency:
          (total(list, "points") +
            total(list, "rebounds") +
            total(list, "assists") +
            total(list, "steals") +
            total(list, "blocks") -
            (total(list, "fga") - total(list, "fgm")) -
            (total(list, "fta") - total(list, "ftm")) -
            total(list, "turnovers")) /
          games,
      });
      const champion = championOf.get(seasonId);
      if (
        champion &&
        list.some(
          (r) => r.team_id === champion && r.games_played >= TITLE_GAMES,
        )
      ) {
        titles += 1;
      }
    }
    const mine = honors.get(id) ?? {};
    const stars = allStars.get(id) ?? 0;
    const score = careerScore({
      seasons,
      honors: mine,
      allStars: stars,
      titles,
    });
    if (!isInducted(score, Number(p.retired_year), season.year)) continue;

    const games = seasons.reduce((n, s) => n + s.games, 0);
    const perGame = (key: keyof Stat) =>
      games === 0 ? 0 : Math.round((total(rows, key) / games) * 10) / 10;
    members.push({
      playerId: id,
      name: `${p.first_name} ${p.last_name}`,
      position: String(p.position),
      retiredYear: Number(p.retired_year),
      inductedYear: inductionYear(Number(p.retired_year)),
      seasons: seasons.length,
      games,
      points: perGame("points"),
      rebounds: perGame("rebounds"),
      assists: perGame("assists"),
      titles,
      allStars: stars,
      honors: Object.entries(mine)
        .filter(([award]) => AWARD_NAMES[award])
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([award, count]) => ({
          label: AWARD_NAMES[award] as string,
          count,
        })),
      score: Math.round(score * 10) / 10,
    });
  }
  members.sort(
    (a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId),
  );
  return { year: season.year, retired: retired.length, members };
}
