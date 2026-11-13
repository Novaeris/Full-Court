import "server-only";
import type { Database } from "@fullcourt/api-client";
import {
  ENGINE_VERSION,
  replayGame,
  type ReplaySnapshot,
} from "@fullcourt/game-engine";
import { buildStandings, type DatedResult } from "@fullcourt/game-rules";
import {
  LeagueIdSchema,
  type GameDetail,
  type GamePlays,
  type GameSummary,
  type ScheduleResponse,
  type StandingRow,
  type StandingsResponse,
} from "@fullcourt/validation";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { latestSeason, seasonView } from "./season-shared";

/**
 * What the season pages read: the schedule, the standings and a single game.
 * Everything runs as the caller under RLS, so another user's league or game
 * simply isn't there ("not found", never "forbidden").
 */

type GameRow = Database["public"]["Tables"]["games"]["Row"];

const toGame = (row: GameRow): GameSummary => ({
  id: row.id,
  day: row.day,
  homeTeamId: row.home_team_id,
  awayTeamId: row.away_team_id,
  status: row.status as GameSummary["status"],
  homeScore: row.home_score,
  awayScore: row.away_score,
  overtimes: row.overtimes,
  round: row.round,
  gameNumber: row.game_number,
});

const invalid = (message: string) =>
  new ApiError(400, "invalid_query", message);
const gameNotFound = () =>
  new ApiError(404, "game_not_found", "That game doesn't exist.");

/** PostgREST returns at most this many rows in one request. */
const PAGE = 1000;

/**
 * A team's whole season, one day, or (with neither) the season's current day.
 * A season has more games than one request can return, so this never asks for
 * the whole league at once.
 */
export async function listSchedule(
  ctx: UserContext,
  leagueId: string,
  filter: { team?: string | undefined; day?: number | undefined },
): Promise<ScheduleResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  const season = await latestSeason(ctx, league.id);
  if (!season) return { season: null, games: [] };

  let query = ctx.supabase
    .from("games")
    .select("*")
    .eq("season_id", season.id)
    .order("day")
    .order("id");
  if (filter.team !== undefined) {
    if (!LeagueIdSchema.safeParse(filter.team).success) {
      throw invalid("team must be a team id.");
    }
    query = query.or(
      `home_team_id.eq.${filter.team},away_team_id.eq.${filter.team}`,
    );
  } else {
    const day = filter.day ?? Math.min(season.day, season.last_day);
    if (!Number.isInteger(day) || day < 1 || day > 1000) {
      throw invalid("day must be a whole number from 1.");
    }
    query = query.eq("day", day);
  }
  const { data, error } = await query.limit(PAGE);
  if (error) throw error;
  return { season: await seasonView(ctx, season), games: data.map(toGame) };
}

/** Every team's record this season, best first, by the standings rules. */
export async function getStandings(
  ctx: UserContext,
  leagueId: string,
): Promise<StandingsResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  const season = await latestSeason(ctx, league.id);
  if (!season) return { season: null, rows: [] };

  const teams = await ctx.supabase
    .from("teams")
    .select("id, conference_id, division_id")
    .eq("league_id", league.id);
  if (teams.error) throw teams.error;

  // An archived season's games are gone; its records live in the history.
  if (season.archived_at) {
    const history = await ctx.supabase
      .from("team_season_stats")
      .select("*")
      .eq("season_id", season.id)
      .order("rank_overall");
    if (history.error) throw history.error;
    const placement = new Map(teams.data.map((t) => [t.id, t]));
    const rows: StandingRow[] = history.data.map((h) => ({
      teamId: h.team_id,
      conferenceId: placement.get(h.team_id)?.conference_id ?? "",
      divisionId: placement.get(h.team_id)?.division_id ?? "",
      rank: h.rank_overall,
      wins: h.wins,
      losses: h.losses,
      winPct: h.wins + h.losses === 0 ? 0 : h.wins / (h.wins + h.losses),
      homeWins: h.home_wins,
      homeLosses: h.home_losses,
      awayWins: h.wins - h.home_wins,
      awayLosses: h.losses - h.home_losses,
      divisionWins: h.division_wins,
      divisionLosses: h.division_losses,
      conferenceWins: h.conference_wins,
      conferenceLosses: h.conference_losses,
      pointsFor: h.points_for,
      pointsAgainst: h.points_against,
      streak: "",
      lastTen: "",
    }));
    return { season: await seasonView(ctx, season), rows };
  }

  const results: DatedResult[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await ctx.supabase
      .from("games")
      .select("day, home_team_id, away_team_id, home_score, away_score")
      .eq("season_id", season.id)
      .eq("status", "final")
      .is("round", null)
      .order("day")
      .order("id")
      .range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    for (const g of page.data) {
      if (g.home_score === null || g.away_score === null) continue;
      results.push({
        day: g.day,
        homeTeamId: g.home_team_id,
        awayTeamId: g.away_team_id,
        homeScore: g.home_score,
        awayScore: g.away_score,
      });
    }
    if (page.data.length < PAGE) break;
  }

  const rows = buildStandings(
    teams.data.map((t) => ({
      teamId: t.id,
      conferenceId: t.conference_id,
      divisionId: t.division_id,
    })),
    results,
  ).map((r): StandingRow => ({
    teamId: r.teamId,
    conferenceId: r.conferenceId,
    divisionId: r.divisionId,
    rank: r.rank,
    wins: r.wins,
    losses: r.losses,
    winPct: r.winPct,
    homeWins: r.homeWins,
    homeLosses: r.homeLosses,
    awayWins: r.awayWins,
    awayLosses: r.awayLosses,
    divisionWins: r.divisionWins,
    divisionLosses: r.divisionLosses,
    conferenceWins: r.conferenceWins,
    conferenceLosses: r.conferenceLosses,
    pointsFor: r.pointsFor,
    pointsAgainst: r.pointsAgainst,
    streak: r.streak,
    lastTen: r.lastTen,
  }));
  return { season: await seasonView(ctx, season), rows };
}

async function loadGame(
  ctx: UserContext,
  leagueId: string,
  gameId: string,
): Promise<GameRow> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  if (!LeagueIdSchema.safeParse(gameId).success) throw gameNotFound();
  const { data, error } = await ctx.supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .eq("league_id", league.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw gameNotFound();
  return data;
}

/** A game with its box score, and what a viewer needs to replay it. */
export async function getGame(
  ctx: UserContext,
  leagueId: string,
  gameId: string,
): Promise<GameDetail> {
  const game = await loadGame(ctx, leagueId, gameId);

  const [lines, replay] = await Promise.all([
    ctx.supabase.from("box_score_lines").select("*").eq("game_id", game.id),
    ctx.supabase
      .from("game_replays")
      .select("engine_version, rng_state, snapshot")
      .eq("game_id", game.id)
      .maybeSingle(),
  ]);
  if (lines.error) throw lines.error;
  if (replay.error) throw replay.error;

  const ids = lines.data.map((l) => l.player_id);
  const players =
    ids.length === 0
      ? { data: [], error: null }
      : await ctx.supabase
          .from("players")
          .select("id, first_name, last_name, jersey, position")
          .in("id", ids);
  if (players.error) throw players.error;
  const byId = new Map(players.data.map((p) => [p.id, p]));

  const detail: GameDetail["lines"] = [];
  for (const l of lines.data) {
    const p = byId.get(l.player_id);
    if (!p) continue;
    detail.push({
      playerId: l.player_id,
      teamId: l.team_id,
      firstName: p.first_name,
      lastName: p.last_name,
      jersey: p.jersey,
      position: p.position as GameDetail["lines"][number]["position"],
      started: l.started,
      minutes: l.minutes,
      points: l.points,
      rebounds: l.rebounds,
      assists: l.assists,
      steals: l.steals,
      blocks: l.blocks,
      turnovers: l.turnovers,
      fouls: l.fouls,
      fgm: l.fgm,
      fga: l.fga,
      tpm: l.tpm,
      tpa: l.tpa,
      ftm: l.ftm,
      fta: l.fta,
    });
  }

  const row = replay.data;
  const replayStatus: GameDetail["replayStatus"] = !row
    ? "missing"
    : row.engine_version === ENGINE_VERSION
      ? "available"
      : "engine-updated";
  return {
    game: toGame(game),
    lines: detail,
    replayStatus,
    replay:
      row && replayStatus === "available"
        ? {
            engineVersion: row.engine_version,
            rngState: row.rng_state,
            snapshot: row.snapshot as Record<string, unknown>,
          }
        : null,
  };
}

/**
 * The game's plays, replayed on the server. The result must end on the
 * stored final score, or the replay can't be trusted and isn't returned.
 */
export async function getGamePlays(
  ctx: UserContext,
  leagueId: string,
  gameId: string,
): Promise<GamePlays> {
  const game = await loadGame(ctx, leagueId, gameId);
  const { data: row, error } = await ctx.supabase
    .from("game_replays")
    .select("engine_version, rng_state, snapshot")
    .eq("game_id", game.id)
    .maybeSingle();
  if (error) throw error;
  const unavailable = () =>
    new ApiError(
      409,
      "replay_unavailable",
      "This game can no longer be replayed.",
    );
  if (!row || row.engine_version !== ENGINE_VERSION) throw unavailable();
  const state = row.rng_state;
  if (state.length !== 4) throw unavailable();

  let replayed;
  try {
    replayed = replayGame(
      {
        id: game.id,
        day: game.day,
        homeTeamId: game.home_team_id,
        awayTeamId: game.away_team_id,
      },
      row.snapshot as unknown as ReplaySnapshot,
      [
        state[0] as number,
        state[1] as number,
        state[2] as number,
        state[3] as number,
      ],
    );
  } catch {
    throw unavailable();
  }
  if (
    replayed.game.homeScore !== game.home_score ||
    replayed.game.awayScore !== game.away_score
  ) {
    throw unavailable();
  }
  return { plays: replayed.plays, starters: replayed.starters };
}
