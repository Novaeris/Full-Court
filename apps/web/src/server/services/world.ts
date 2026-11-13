import "server-only";
import type { Database } from "@fullcourt/api-client";
import {
  LeagueIdSchema,
  type ChooseTeamRequest,
  type League,
  type LeagueStructure,
  type RenameStructureRequest,
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
  "id, abbreviation, city, nickname, conference_id, division_id, primary_color, secondary_color, city_id, logo_id, local_player_slot, ai_trades, ai_roster_coverage, ai_roster_management, ai_scouting, ai_drafting" as const;

/** Display names and order of a league's conferences and divisions. */
type Structure = {
  conferences: Map<string, { name: string; order: number }>;
  divisions: Map<string, { name: string; order: number }>;
};

async function loadStructure(
  ctx: UserContext,
  leagueId: string,
): Promise<Structure> {
  const [conferences, divisions] = await Promise.all([
    ctx.supabase
      .from("league_conferences")
      .select("id, name, sort_order")
      .eq("league_id", leagueId),
    ctx.supabase
      .from("league_divisions")
      .select("id, name, sort_order")
      .eq("league_id", leagueId),
  ]);
  if (conferences.error) throw conferences.error;
  if (divisions.error) throw divisions.error;
  const index = (rows: { id: string; name: string; sort_order: number }[]) =>
    new Map(rows.map((r) => [r.id, { name: r.name, order: r.sort_order }]));
  return {
    conferences: index(conferences.data),
    divisions: index(divisions.data),
  };
}

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
    | "conference_id"
    | "division_id"
    | "primary_color"
    | "secondary_color"
    | "city_id"
    | "logo_id"
    | "local_player_slot"
    | "ai_trades"
    | "ai_roster_coverage"
    | "ai_roster_management"
    | "ai_scouting"
    | "ai_drafting"
  >,
  strength: number,
  structure: Structure,
): Team {
  return {
    id: row.id,
    abbreviation: row.abbreviation,
    city: row.city,
    nickname: row.nickname,
    conferenceId: row.conference_id,
    divisionId: row.division_id,
    conference: structure.conferences.get(row.conference_id)?.name ?? "",
    division: structure.divisions.get(row.division_id)?.name ?? "",
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    cityId: row.city_id,
    logoId: row.logo_id,
    localPlayerSlot: row.local_player_slot,
    aiAssist: {
      trades: row.ai_trades,
      rosterCoverage: row.ai_roster_coverage,
      rosterManagement: row.ai_roster_management,
      scouting: row.ai_scouting,
      drafting: row.ai_drafting,
    },
    strength,
  };
}

function toPlayer(
  row: Omit<
    PlayerRow,
    | "league_id"
    | "status"
    | "retired_year"
    | "draft_year"
    | "draft_round"
    | "draft_pick"
  >,
): Player {
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
  const [teams, players, structure] = await Promise.all([
    ctx.supabase
      .from("teams")
      .select(TEAM_COLUMNS)
      .eq("league_id", league.id)
      .order("city"),
    ctx.supabase
      .from("players")
      .select("team_id, overall")
      .eq("league_id", league.id)
      .not("team_id", "is", null),
    loadStructure(ctx, league.id),
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
  const order = (id: string, of: Map<string, { order: number }>) =>
    of.get(id)?.order ?? 0;
  return teams.data
    .map((t) => toTeam(t, teamStrength(byTeam.get(t.id) ?? []), structure))
    .sort(
      (a, b) =>
        order(a.conferenceId, structure.conferences) -
          order(b.conferenceId, structure.conferences) ||
        order(a.divisionId, structure.divisions) -
          order(b.divisionId, structure.divisions) ||
        a.city.localeCompare(b.city),
    );
}

/** One team and its roster, best players first. */
export async function getTeam(
  ctx: UserContext,
  leagueId: string,
  teamId: string,
): Promise<TeamDetail> {
  const league = await getLeague(ctx, leagueId);
  const id = parseTeamId(teamId);
  const [team, players, structure] = await Promise.all([
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
    loadStructure(ctx, league.id),
  ]);
  if (team.error) throw team.error;
  if (players.error) throw players.error;
  if (!team.data) throw teamNotFound();
  return {
    team: toTeam(
      team.data,
      teamStrength(players.data.map((p) => p.overall)),
      structure,
    ),
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
    // A prospect is only known through the draft board, which shows what the scouts see.
    .neq("status", "prospect")
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

/** The league's conferences and divisions, in order, with team counts. */
export async function getStructure(
  ctx: UserContext,
  leagueId: string,
): Promise<LeagueStructure> {
  const league = await getLeague(ctx, leagueId);
  const [conferences, divisions, teams] = await Promise.all([
    ctx.supabase
      .from("league_conferences")
      .select("id, name, sort_order")
      .eq("league_id", league.id)
      .order("sort_order"),
    ctx.supabase
      .from("league_divisions")
      .select("id, conference_id, name, sort_order")
      .eq("league_id", league.id)
      .order("sort_order"),
    ctx.supabase.from("teams").select("division_id").eq("league_id", league.id),
  ]);
  if (conferences.error) throw conferences.error;
  if (divisions.error) throw divisions.error;
  if (teams.error) throw teams.error;
  const sizes = new Map<string, number>();
  for (const t of teams.data) {
    sizes.set(t.division_id, (sizes.get(t.division_id) ?? 0) + 1);
  }
  return {
    conferences: conferences.data.map((c) => ({
      id: c.id,
      name: c.name,
      divisions: divisions.data
        .filter((d) => d.conference_id === c.id)
        .map((d) => ({
          id: d.id,
          name: d.name,
          teamCount: sizes.get(d.id) ?? 0,
        })),
    })),
  };
}

/**
 * Renames conferences and divisions. Ids never change, so nothing that
 * refers to them breaks. Two conferences can't share a name, and neither can
 * two divisions in one conference.
 */
export async function renameStructure(
  ctx: UserContext,
  leagueId: string,
  input: RenameStructureRequest,
): Promise<LeagueStructure> {
  const league = await getLeague(ctx, leagueId);
  const { error } = await ctx.supabase.rpc("rename_structure", {
    target_league: league.id,
    conference_names: input.conferences,
    division_names: input.divisions,
  });
  if (error) {
    if (error.message === "league_not_found") {
      throw new ApiError(404, "league_not_found", "That league doesn't exist.");
    }
    if (error.code === "23505") {
      throw new ApiError(
        409,
        "name_taken",
        "Two conferences, or two divisions in one conference, can't share a name.",
      );
    }
    if (
      ["unknown_conference", "unknown_division", "invalid_names"].includes(
        error.message,
      ) ||
      error.code === "23514"
    ) {
      throw new ApiError(
        400,
        "invalid_names",
        "Check the names and try again.",
      );
    }
    throw error;
  }
  return getStructure(ctx, league.id);
}
