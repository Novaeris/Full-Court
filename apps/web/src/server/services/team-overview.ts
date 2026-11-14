import "server-only";
import { chooseTeamStrategy, describeStyle } from "@fullcourt/game-rules";
import type { TeamOverview } from "@fullcourt/validation";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { latestSeason } from "./season-shared";
import { getStandings, listSchedule } from "./season";

/**
 * How a team's season is going (docs/DESIGN.md, "The team page"): its record
 * and place, how it plays, its latest results and next games, and its best
 * players this season. Worked out from the records when asked.
 */

const LEVELS = {
  pace: ["slow", "normal", "fast"],
  threePointFocus: ["low", "normal", "high"],
  defense: ["balanced", "perimeter", "interior"],
} as const;

const oneOf = <T extends string>(
  options: readonly T[],
  value: string,
  fallback: T,
): T =>
  (options as readonly string[]).includes(value) ? (value as T) : fallback;

export async function getTeamOverview(
  ctx: UserContext,
  leagueIdParam: string,
  teamId: string,
): Promise<TeamOverview> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [team, roster, season] = await Promise.all([
    ctx.supabase
      .from("teams")
      .select(
        "id, local_player_slot, strategy_pace, strategy_three_point, strategy_defense",
      )
      .eq("league_id", league.id)
      .eq("id", teamId)
      .maybeSingle(),
    ctx.supabase
      .from("players")
      .select(
        "id, first_name, last_name, overall, three_point, speed, stamina, perimeter_d, interior_d",
      )
      .eq("league_id", league.id)
      .eq("team_id", teamId)
      .eq("status", "active"),
    latestSeason(ctx, league.id),
  ]);
  if (team.error) throw team.error;
  if (roster.error) throw roster.error;
  if (!team.data) {
    throw new ApiError(
      404,
      "team_not_found",
      "That team isn't in this league.",
    );
  }

  // An owner's team plays what they saved; a computer team the style its roster suits.
  const setByOwner = team.data.local_player_slot !== null;
  const style = setByOwner
    ? {
        pace: oneOf(LEVELS.pace, team.data.strategy_pace, "normal"),
        threePointFocus: oneOf(
          LEVELS.threePointFocus,
          team.data.strategy_three_point,
          "normal",
        ),
        defense: oneOf(LEVELS.defense, team.data.strategy_defense, "balanced"),
      }
    : chooseTeamStrategy(
        roster.data.map((p) => ({
          overall: p.overall,
          threePoint: p.three_point,
          speed: p.speed,
          stamina: p.stamina,
          perimeterD: p.perimeter_d,
          interiorD: p.interior_d,
        })),
      );
  const base = {
    teamId,
    style: { ...style, words: describeStyle(style), setByOwner },
  };
  if (!season) {
    return {
      ...base,
      season: null,
      record: null,
      recent: [],
      upcoming: [],
      leaders: [],
    };
  }

  const [standings, schedule, totals] = await Promise.all([
    getStandings(ctx, league.id),
    listSchedule(ctx, league.id, { team: teamId }),
    ctx.supabase
      .rpc("player_season_totals", {
        target_season: season.id,
        playoffs: false,
      })
      .range(0, 4999),
  ]);
  if (totals.error) throw totals.error;

  const row = standings.rows.find((r) => r.teamId === teamId);
  const played = row ? row.wins + row.losses : 0;
  const mine = (g: (typeof schedule.games)[number]) => g.homeTeamId === teamId;
  const view = (g: (typeof schedule.games)[number]) => {
    const home = mine(g);
    const final =
      g.status === "final" && g.homeScore !== null && g.awayScore !== null;
    const ours = home ? g.homeScore : g.awayScore;
    const theirs = home ? g.awayScore : g.homeScore;
    return {
      gameId: g.id,
      day: g.day,
      opponentId: home ? g.awayTeamId : g.homeTeamId,
      home,
      won: final ? (ours as number) > (theirs as number) : null,
      score: final ? `${ours}-${theirs}` : null,
      round: g.round,
    };
  };
  const finals = schedule.games.filter((g) => g.status === "final");
  const ahead = schedule.games.filter((g) => g.status === "scheduled");

  // The team's best players per game this season.
  const rosterIds = new Map(
    roster.data.map((p) => [p.id, `${p.first_name} ${p.last_name}`]),
  );
  const mineTotals = (
    totals.data as unknown as {
      player_id: string;
      team_id: string;
      games: number;
      points: number;
      rebounds: number;
      assists: number;
    }[]
  ).filter((t) => t.team_id === teamId && rosterIds.has(t.player_id));
  const leader = (category: "points" | "rebounds" | "assists") => {
    const best = [...mineTotals]
      .filter((t) => t.games > 0)
      .sort(
        (a, b) =>
          b[category] / b.games - a[category] / a.games ||
          (a.player_id < b.player_id ? -1 : 1),
      )[0];
    return best
      ? [
          {
            category,
            playerId: best.player_id,
            name: rosterIds.get(best.player_id) ?? "Unknown",
            perGame: Math.round((best[category] / best.games) * 10) / 10,
          },
        ]
      : [];
  };

  return {
    ...base,
    season: { year: season.year, phase: season.phase },
    record:
      row && played > 0
        ? {
            rank: row.rank,
            teams: standings.rows.length,
            wins: row.wins,
            losses: row.losses,
            pointsFor: Math.round((row.pointsFor / played) * 10) / 10,
            pointsAgainst: Math.round((row.pointsAgainst / played) * 10) / 10,
            streak: row.streak,
            lastTen: row.lastTen,
          }
        : null,
    recent: finals.slice(-5).reverse().map(view),
    upcoming: ahead.slice(0, 3).map(view),
    leaders: [...leader("points"), ...leader("rebounds"), ...leader("assists")],
  };
}
