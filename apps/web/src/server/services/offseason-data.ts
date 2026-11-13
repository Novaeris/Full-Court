import "server-only";
import type {
  CampPlayer,
  OffseasonPlayer as EnginePlayer,
  StaffMember as EngineStaff,
} from "@fullcourt/game-engine";
import {
  RATING_KEYS,
  type Position,
  type Ratings,
  type StaffRole,
} from "@fullcourt/game-types";
import type { UserContext } from "@/server/auth/session";
import type { SeasonRow } from "./season-shared";

/**
 * Reads the offseason's steps share: every player and staff member of a
 * league as the engine sees them, who the owner's teams are, and how the
 * previous season finished. Reads go through the owner's own session, so row
 * level security applies.
 */

export const PAGE = 1000;

/** Database column for each rating. */
export const RATING_COLUMNS: Record<keyof Ratings, string> = {
  inside: "inside",
  midRange: "mid_range",
  threePoint: "three_point",
  freeThrow: "free_throw",
  passing: "passing",
  ballHandling: "ball_handling",
  offRebound: "off_rebound",
  defRebound: "def_rebound",
  perimeterD: "perimeter_d",
  interiorD: "interior_d",
  speed: "speed",
  strength: "strength",
  stamina: "stamina",
};

export const PLAYER_SELECT = [
  "id",
  "team_id",
  "first_name",
  "last_name",
  "position",
  "age",
  "jersey",
  "overall",
  "potential",
  ...Object.values(RATING_COLUMNS),
].join(", ");

export type Row = Record<string, string | number | null>;

/** Every row of a query, a page at a time (PostgREST returns at most 1000). */
export async function allRows(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

export function toEnginePlayer(row: Row): EnginePlayer {
  const ratings = {} as Ratings;
  for (const key of RATING_KEYS) {
    ratings[key] = Number(row[RATING_COLUMNS[key]]);
  }
  return {
    id: String(row.id),
    teamId: row.team_id ? String(row.team_id) : null,
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    position: row.position as Position,
    age: Number(row.age),
    jersey: Number(row.jersey),
    ratings,
    overall: Number(row.overall),
    potential: Number(row.potential),
  };
}

/** Every active player in a league, on a team or free. */
export async function loadActivePlayers(
  ctx: UserContext,
  leagueId: string,
): Promise<EnginePlayer[]> {
  const rows = await allRows((from, to) =>
    ctx.supabase
      .from("players")
      .select(PLAYER_SELECT)
      .eq("league_id", leagueId)
      .eq("status", "active")
      .order("id")
      .range(from, to),
  );
  return rows.map(toEnginePlayer);
}

/** Every name a player has had in the league, retired or not. */
export async function loadPlayerNames(
  ctx: UserContext,
  leagueId: string,
): Promise<Set<string>> {
  const rows = await allRows((from, to) =>
    ctx.supabase
      .from("players")
      .select("first_name, last_name")
      .eq("league_id", leagueId)
      .order("id")
      .range(from, to),
  );
  return new Set(rows.map((n) => `${n.first_name} ${n.last_name}`));
}

export function toCampPlayer(p: EnginePlayer): CampPlayer {
  return {
    id: p.id,
    teamId: p.teamId as string,
    position: p.position,
    age: p.age,
    ratings: p.ratings,
    overall: p.overall,
    potential: p.potential,
  };
}

/** Every staff member (active or retired) in a league, as the engine sees them. */
export async function loadStaff(
  ctx: UserContext,
  leagueId: string,
): Promise<EngineStaff[]> {
  const rows = await allRows((from, to) =>
    ctx.supabase
      .from("staff_members")
      .select("*")
      .eq("league_id", leagueId)
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({
    id: String(r.id),
    firstName: String(r.first_name),
    lastName: String(r.last_name),
    role: r.role as StaffRole,
    rating: Number(r.rating),
    age: Number(r.age),
    salary: Number(r.salary),
    teamId: r.team_id ? String(r.team_id) : null,
    contractYears: r.contract_years === null ? null : Number(r.contract_years),
    retired: r.status === "retired",
  }));
}

/** The teams the user runs, in slot order. */
export async function ownedTeamIds(
  ctx: UserContext,
  leagueId: string,
): Promise<string[]> {
  const { data, error } = await ctx.supabase
    .from("teams")
    .select("id, local_player_slot")
    .eq("league_id", leagueId)
    .not("local_player_slot", "is", null)
    .order("local_player_slot");
  if (error) throw error;
  return data.map((t) => t.id);
}

/** Every team in a league. */
export async function allTeamIds(
  ctx: UserContext,
  leagueId: string,
): Promise<string[]> {
  const { data, error } = await ctx.supabase
    .from("teams")
    .select("id")
    .eq("league_id", leagueId);
  if (error) throw error;
  return data.map((t) => t.id);
}

/**
 * How the season before an offseason finished: every team best first (from the
 * archived team records) and how far each playoff team got (from the bracket,
 * which is kept): the rounds played, plus one for winning the title.
 */
export async function previousFinish(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
): Promise<{
  standingsOrder: string[];
  playoffDepth: Map<string, number>;
}> {
  const previous = await ctx.supabase
    .from("seasons")
    .select("id")
    .eq("league_id", leagueId)
    .eq("year", season.year - 1)
    .maybeSingle();
  if (previous.error) throw previous.error;
  if (!previous.data) {
    throw new Error("The season before this offseason is missing.");
  }
  const [stats, series] = await Promise.all([
    ctx.supabase
      .from("team_season_stats")
      .select("team_id, rank_overall")
      .eq("season_id", previous.data.id)
      .order("rank_overall"),
    ctx.supabase
      .from("playoff_series")
      .select("round, team_a, team_b, winner_team_id")
      .eq("season_id", previous.data.id),
  ]);
  if (stats.error) throw stats.error;
  if (series.error) throw series.error;

  const lastRound = Math.max(0, ...series.data.map((s) => s.round));
  const playoffDepth = new Map<string, number>();
  for (const s of series.data) {
    for (const team of [s.team_a, s.team_b]) {
      const won = s.round === lastRound && s.winner_team_id === team ? 1 : 0;
      playoffDepth.set(
        team,
        Math.max(playoffDepth.get(team) ?? 0, s.round + won),
      );
    }
  }
  return {
    standingsOrder: stats.data.map((t) => t.team_id),
    playoffDepth,
  };
}

export type OwnedTeam = {
  id: string;
  assist: {
    trades: boolean;
    rosterCoverage: boolean;
    rosterManagement: boolean;
    scouting: boolean;
    drafting: boolean;
  };
};

/** The teams the user runs, in slot order, with their AI Assist switches. */
export async function ownedTeams(
  ctx: UserContext,
  leagueId: string,
): Promise<OwnedTeam[]> {
  const { data, error } = await ctx.supabase
    .from("teams")
    .select(
      "id, local_player_slot, ai_trades, ai_roster_coverage, ai_roster_management, ai_scouting, ai_drafting",
    )
    .eq("league_id", leagueId)
    .not("local_player_slot", "is", null)
    .order("local_player_slot");
  if (error) throw error;
  return data.map((t) => ({
    id: t.id,
    assist: {
      trades: t.ai_trades,
      rosterCoverage: t.ai_roster_coverage,
      rosterManagement: t.ai_roster_management,
      scouting: t.ai_scouting,
      drafting: t.ai_drafting,
    },
  }));
}
