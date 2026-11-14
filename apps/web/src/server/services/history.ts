import "server-only";
import { AWARD_NAMES, PLAYER_AWARDS } from "@fullcourt/game-rules";
import type { HistoryResponse } from "@fullcourt/validation";
import type { UserContext } from "@/server/auth/session";
import { awardSeason } from "./awards";
import { getLeague, parseLeagueId } from "./leagues";
import { allRows } from "./offseason-data";

/**
 * The league's history: champions, awards and records from the archived
 * seasons (docs/DESIGN.md, "Awards and history"). A season archived before
 * awards existed, or whose awards failed, gets them worked out here.
 */

type AwardRow = {
  season_id: string;
  award: string;
  team_id: string | null;
  player_id: string | null;
};

async function loadAwards(
  ctx: UserContext,
  leagueId: string,
): Promise<AwardRow[]> {
  return (await allRows((from, to) =>
    ctx.supabase
      .from("season_awards")
      .select("season_id, award, team_id, player_id")
      .eq("league_id", leagueId)
      .order("created_at")
      .order("id")
      .range(from, to),
  )) as unknown as AwardRow[];
}

/** The game highs: a label, the column that holds it and the day and opponent columns. */
const GAME_HIGHS = [
  ["points", "Points in a game", "high_points"],
  ["rebounds", "Rebounds in a game", "high_rebounds"],
  ["assists", "Assists in a game", "high_assists"],
  ["steals", "Steals in a game", "high_steals"],
  ["blocks", "Blocks in a game", "high_blocks"],
  ["threes", "Threes in a game", "high_threes"],
] as const;

const SEASON_TOTALS = [
  ["points", "Points in a season"],
  ["rebounds", "Rebounds in a season"],
  ["assists", "Assists in a season"],
  ["steals", "Steals in a season"],
  ["blocks", "Blocks in a season"],
] as const;

export async function getHistory(
  ctx: UserContext,
  leagueIdParam: string,
): Promise<HistoryResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const seasonsQ = await ctx.supabase
    .from("seasons")
    .select("*")
    .eq("league_id", league.id)
    .not("archived_at", "is", null)
    .order("year", { ascending: false });
  if (seasonsQ.error) throw seasonsQ.error;
  const seasons = seasonsQ.data;
  const yearOf = new Map(seasons.map((s) => [s.id, s.year]));

  let awards = await loadAwards(ctx, league.id);
  // Seasons that were decided but have no awards yet get them now.
  const decided = new Set(
    awards.filter((a) => a.award === "champion").map((a) => a.season_id),
  );
  const judged = new Set(
    awards.filter((a) => a.award === "mvp").map((a) => a.season_id),
  );
  const missing = seasons.filter((s) => decided.has(s.id) && !judged.has(s.id));
  for (const s of missing) {
    try {
      await awardSeason(ctx, league.id, s);
    } catch (error) {
      console.error("Season awards failed", { leagueId: league.id, error });
    }
  }
  if (missing.length > 0) awards = await loadAwards(ctx, league.id);

  // The All-Star Games, one a season.
  const starGames = await ctx.supabase
    .from("all_star_games")
    .select("season_id, name_a, name_b, score_a, score_b, mvp_player_id")
    .eq("league_id", league.id);
  if (starGames.error) throw starGames.error;
  const starBySeason = new Map(starGames.data.map((g) => [g.season_id, g]));

  // Records: the best of each, found by the database.
  const best = await Promise.all([
    ...GAME_HIGHS.map(([, , column]) =>
      ctx.supabase
        .from("player_season_stats")
        .select(
          `season_id, player_id, team_id, ${column}, ${column}_day, ${column}_opponent_id`,
        )
        .eq("league_id", league.id)
        .eq("playoffs", false)
        .order(column, { ascending: false })
        .order("season_id")
        .limit(1),
    ),
    ...SEASON_TOTALS.map(([column]) =>
      ctx.supabase
        .from("player_season_stats")
        .select(`season_id, player_id, team_id, ${column}`)
        .eq("league_id", league.id)
        .eq("playoffs", false)
        .order(column, { ascending: false })
        .order("season_id")
        .limit(1),
    ),
    ctx.supabase
      .from("team_season_stats")
      .select("season_id, team_id, wins, losses")
      .eq("league_id", league.id)
      .order("wins", { ascending: false })
      .order("season_id")
      .limit(5),
  ]);
  for (const r of best) if (r.error) throw r.error;
  const rows = (i: number) =>
    (best[i]?.data ?? []) as unknown as Record<string, unknown>[];

  // Everyone named, with name and position.
  const wanted = new Set<string>();
  for (const a of awards) if (a.player_id) wanted.add(a.player_id);
  for (const g of starGames.data) {
    if (g.mvp_player_id) wanted.add(g.mvp_player_id);
  }
  for (let i = 0; i < GAME_HIGHS.length + SEASON_TOTALS.length; i++) {
    for (const r of rows(i)) wanted.add(String(r.player_id));
  }
  const people = new Map<string, { name: string; position: string }>();
  const ids = [...wanted];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await ctx.supabase
      .from("players")
      .select("id, first_name, last_name, position")
      .eq("league_id", league.id)
      .in("id", ids.slice(i, i + 150));
    if (error) throw error;
    for (const p of data) {
      people.set(p.id, {
        name: `${p.first_name} ${p.last_name}`,
        position: p.position,
      });
    }
  }
  const named = (playerId: string, teamId: string) => ({
    playerId,
    name: people.get(playerId)?.name ?? "Unknown",
    position: people.get(playerId)?.position ?? "",
    teamId,
  });

  const bySeason = new Map<string, AwardRow[]>();
  for (const a of awards) {
    bySeason.set(a.season_id, [...(bySeason.get(a.season_id) ?? []), a]);
  }

  const titles = new Map<string, { titles: number; finals: number }>();
  const bump = (team: string, key: "titles" | "finals") => {
    const t = titles.get(team) ?? { titles: 0, finals: 0 };
    t[key]++;
    titles.set(team, t);
  };

  const seasonViews = seasons.map((s) => {
    const list = bySeason.get(s.id) ?? [];
    const champion = list.find((a) => a.award === "champion")?.team_id ?? null;
    const finalist = list.find((a) => a.award === "finalist")?.team_id ?? null;
    if (champion) {
      bump(champion, "titles");
      bump(champion, "finals");
    }
    if (finalist) bump(finalist, "finals");
    const mine = (award: string) =>
      list.filter(
        (a) => a.award === award && a.player_id !== null && a.team_id !== null,
      );
    const star = starBySeason.get(s.id);
    return {
      year: s.year,
      championId: champion,
      finalistId: finalist,
      allStar: star
        ? {
            nameA: star.name_a,
            nameB: star.name_b,
            scoreA: star.score_a,
            scoreB: star.score_b,
            mvpName: star.mvp_player_id
              ? (people.get(star.mvp_player_id)?.name ?? null)
              : null,
          }
        : null,
      awards: PLAYER_AWARDS.flatMap((award) =>
        mine(award).map((a) => ({
          ...named(a.player_id as string, a.team_id as string),
          award,
          label: AWARD_NAMES[award] ?? award,
        })),
      ),
      allLeague: [1, 2, 3].flatMap((team) => {
        const players = mine(`all-league-${team}`).map((a) =>
          named(a.player_id as string, a.team_id as string),
        );
        return players.length > 0 ? [{ team, players }] : [];
      }),
    };
  });

  return {
    seasons: seasonViews,
    titles: [...titles]
      .map(([teamId, t]) => ({ teamId, ...t }))
      .sort(
        (a, b) =>
          b.titles - a.titles ||
          b.finals - a.finals ||
          (a.teamId < b.teamId ? -1 : 1),
      ),
    records: {
      game: GAME_HIGHS.flatMap(([, label, column], i) => {
        const r = rows(i)[0];
        if (!r || Number(r[column]) <= 0) return [];
        return [
          {
            label,
            value: Number(r[column]),
            ...named(String(r.player_id), String(r.team_id)),
            year: yearOf.get(String(r.season_id)) ?? 0,
            day: Number(r[`${column}_day`]),
            opponentId: String(r[`${column}_opponent_id`]),
          },
        ];
      }).map(({ position: _position, ...rest }) => rest),
      season: SEASON_TOTALS.flatMap(([column, label], i) => {
        const r = rows(GAME_HIGHS.length + i)[0];
        if (!r || Number(r[column]) <= 0) return [];
        const { position: _position, ...who } = named(
          String(r.player_id),
          String(r.team_id),
        );
        return [
          {
            label,
            value: Number(r[column]),
            ...who,
            year: yearOf.get(String(r.season_id)) ?? 0,
          },
        ];
      }),
      teams: rows(GAME_HIGHS.length + SEASON_TOTALS.length).map((r) => ({
        teamId: String(r.team_id),
        year: yearOf.get(String(r.season_id)) ?? 0,
        wins: Number(r.wins),
        losses: Number(r.losses),
      })),
    },
  };
}

/** A player's archived seasons (regular season, per game) and the awards he won. */
export type PlayerCareer = {
  seasons: {
    year: number;
    teamId: string;
    games: number;
    points: number;
    rebounds: number;
    assists: number;
  }[];
  awards: { year: number; award: string; label: string }[];
};

export async function getCareer(
  ctx: UserContext,
  leagueId: string,
  playerId: string,
): Promise<PlayerCareer> {
  const [stats, awards, stars] = await Promise.all([
    ctx.supabase
      .from("player_season_stats")
      .select("season_id, team_id, games_played, points, rebounds, assists")
      .eq("league_id", leagueId)
      .eq("player_id", playerId)
      .eq("playoffs", false),
    ctx.supabase
      .from("season_awards")
      .select("season_id, award")
      .eq("league_id", leagueId)
      .eq("player_id", playerId),
    ctx.supabase
      .from("all_star_players")
      .select("game_id")
      .eq("league_id", leagueId)
      .eq("player_id", playerId),
  ]);
  if (stats.error) throw stats.error;
  if (awards.error) throw awards.error;
  if (stars.error) throw stars.error;
  // The seasons of his All-Star Games.
  const starGames = stars.data.length
    ? await ctx.supabase
        .from("all_star_games")
        .select("id, season_id")
        .eq("league_id", leagueId)
        .in(
          "id",
          stars.data.map((s) => s.game_id),
        )
    : { data: [], error: null };
  if (starGames.error) throw starGames.error;
  const seasonIds = [
    ...new Set([
      ...stats.data.map((s) => s.season_id),
      ...awards.data.map((a) => a.season_id),
      ...starGames.data.map((g) => g.season_id),
    ]),
  ];
  if (seasonIds.length === 0) return { seasons: [], awards: [] };
  const seasons = await ctx.supabase
    .from("seasons")
    .select("id, year")
    .eq("league_id", leagueId)
    .in("id", seasonIds);
  if (seasons.error) throw seasons.error;
  const yearOf = new Map(seasons.data.map((s) => [s.id, s.year]));
  const order = [
    ...PLAYER_AWARDS,
    "all-league-1",
    "all-league-2",
    "all-league-3",
    "all-star",
  ];
  return {
    seasons: stats.data
      .map((s) => ({
        year: yearOf.get(s.season_id) ?? 0,
        teamId: s.team_id,
        games: s.games_played,
        points: s.points / s.games_played,
        rebounds: s.rebounds / s.games_played,
        assists: s.assists / s.games_played,
      }))
      .sort((a, b) => a.year - b.year),
    awards: [
      ...awards.data.map((a) => ({
        year: yearOf.get(a.season_id) ?? 0,
        award: a.award,
        label: AWARD_NAMES[a.award] ?? a.award,
      })),
      ...starGames.data.map((g) => ({
        year: yearOf.get(g.season_id) ?? 0,
        award: "all-star",
        label: "All-Star",
      })),
    ].sort(
      (a, b) =>
        a.year - b.year ||
        order.indexOf(a.award as (typeof order)[number]) -
          order.indexOf(b.award as (typeof order)[number]),
    ),
  };
}
