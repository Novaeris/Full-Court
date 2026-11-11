import "server-only";
import type { Database } from "@fullcourt/api-client";
import {
  LeagueIdSchema,
  type ChooseTeamRequest,
  type League,
  type Player,
  type Team,
  type TeamDetail,
} from "@fullcourt/validation";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague } from "./leagues";

/**
 * Teams, rosters and choosing a team. Reads run as the caller under RLS:
 * only the league's owner can see its world, and nobody can write it.
 */

type TeamRow = Database["public"]["Tables"]["teams"]["Row"];
type PlayerRow = Database["public"]["Tables"]["players"]["Row"];

const TEAM_COLUMNS =
  "id, abbreviation, city, nickname, conference, division, primary_color, secondary_color" as const;

const PLAYER_COLUMNS =
  "id, team_id, first_name, last_name, position, age, height_inches, weight_pounds, jersey, overall, potential, inside, mid_range, three_point, free_throw, passing, ball_handling, off_rebound, def_rebound, perimeter_d, interior_d, speed, strength, stamina" as const;

/** Players that count towards a team's strength figure. */
const ROTATION = 8;

const teamNotFound = () =>
  new ApiError(404, "team_not_found", "That team isn't in this league.");

function teamStrength(overalls: number[]): number {
  const top = [...overalls].sort((a, b) => b - a).slice(0, ROTATION);
  if (top.length === 0) return 0;
  return Math.round(top.reduce((sum, n) => sum + n, 0) / top.length);
}

function toTeam(
  row: Pick<
    TeamRow,
    | "id"
    | "abbreviation"
    | "city"
    | "nickname"
    | "conference"
    | "division"
    | "primary_color"
    | "secondary_color"
  >,
  strength: number,
): Team {
  return {
    id: row.id,
    abbreviation: row.abbreviation,
    city: row.city,
    nickname: row.nickname,
    conference: row.conference as Team["conference"],
    division: row.division,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    strength,
  };
}

function toPlayer(row: Omit<PlayerRow, "league_id">): Player {
  return {
    id: row.id,
    teamId: row.team_id,
    firstName: row.first_name,
    lastName: row.last_name,
    position: row.position as Player["position"],
    age: row.age,
    heightInches: row.height_inches,
    weightPounds: row.weight_pounds,
    jersey: row.jersey,
    overall: row.overall,
    potential: row.potential,
    ratings: {
      inside: row.inside,
      midRange: row.mid_range,
      threePoint: row.three_point,
      freeThrow: row.free_throw,
      passing: row.passing,
      ballHandling: row.ball_handling,
      offRebound: row.off_rebound,
      defRebound: row.def_rebound,
      perimeterD: row.perimeter_d,
      interiorD: row.interior_d,
      speed: row.speed,
      strength: row.strength,
      stamina: row.stamina,
    },
  };
}

function parseTeamId(id: string): string {
  const parsed = LeagueIdSchema.safeParse(id);
  if (!parsed.success) throw teamNotFound();
  return parsed.data;
}

/** Every team in the league, ordered by conference, division and city. */
export async function listTeams(
  ctx: UserContext,
  leagueId: string,
): Promise<Team[]> {
  const league = await getLeague(ctx, leagueId);
  const [teams, players] = await Promise.all([
    ctx.supabase
      .from("teams")
      .select(TEAM_COLUMNS)
      .eq("league_id", league.id)
      .order("conference")
      .order("division")
      .order("city"),
    ctx.supabase
      .from("players")
      .select("team_id, overall")
      .eq("league_id", league.id),
  ]);
  if (teams.error) throw teams.error;
  if (players.error) throw players.error;

  const byTeam = new Map<string, number[]>();
  for (const p of players.data) {
    if (!p.team_id) continue;
    const list = byTeam.get(p.team_id) ?? [];
    list.push(p.overall);
    byTeam.set(p.team_id, list);
  }
  return teams.data.map((t) => toTeam(t, teamStrength(byTeam.get(t.id) ?? [])));
}

/** One team and its roster, best players first. */
export async function getTeam(
  ctx: UserContext,
  leagueId: string,
  teamId: string,
): Promise<TeamDetail> {
  const league = await getLeague(ctx, leagueId);
  const id = parseTeamId(teamId);
  const [team, players] = await Promise.all([
    ctx.supabase
      .from("teams")
      .select(TEAM_COLUMNS)
      .eq("league_id", league.id)
      .eq("id", id)
      .maybeSingle(),
    ctx.supabase
      .from("players")
      .select(PLAYER_COLUMNS)
      .eq("league_id", league.id)
      .eq("team_id", id)
      .order("overall", { ascending: false })
      .order("last_name"),
  ]);
  if (team.error) throw team.error;
  if (players.error) throw players.error;
  if (!team.data) throw teamNotFound();
  return {
    team: toTeam(team.data, teamStrength(players.data.map((p) => p.overall))),
    players: players.data.map(toPlayer),
  };
}

/** One player, with their team. */
export async function getPlayer(
  ctx: UserContext,
  leagueId: string,
  playerId: string,
): Promise<{ player: Player; team: Team | null }> {
  const league = await getLeague(ctx, leagueId);
  const parsed = LeagueIdSchema.safeParse(playerId);
  const notFound = () =>
    new ApiError(404, "player_not_found", "That player isn't in this league.");
  if (!parsed.success) throw notFound();

  const { data, error } = await ctx.supabase
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("league_id", league.id)
    .eq("id", parsed.data)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  const player = toPlayer(data);
  const team = player.teamId
    ? (await getTeam(ctx, league.id, player.teamId)).team
    : null;
  return { player, team };
}

/** Picks the team the user runs. Allowed once, while the league is being set up. */
export async function chooseTeam(
  ctx: UserContext,
  leagueId: string,
  input: ChooseTeamRequest,
): Promise<League> {
  const league = await getLeague(ctx, leagueId);
  const { error } = await ctx.supabase.rpc("choose_team", {
    target_league: league.id,
    target_team: input.teamId,
  });
  if (error) {
    switch (error.message) {
      case "team_not_found":
        throw teamNotFound();
      case "league_not_found":
        throw new ApiError(
          404,
          "league_not_found",
          "That league doesn't exist.",
        );
      case "team_already_chosen":
        throw new ApiError(
          409,
          "team_already_chosen",
          "You've already chosen your team for this league.",
        );
      default:
        throw error;
    }
  }
  return getLeague(ctx, league.id);
}
