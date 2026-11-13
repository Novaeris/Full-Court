import "server-only";
import {
  hardCeiling,
  historyScore,
  marketScore,
  midLevelException,
  minSalary,
  playerValue,
  salaryCap,
  winningScore,
  type Appeal,
} from "@fullcourt/game-rules";
import { askingSalary, askingYears, maxYearsFor } from "@fullcourt/game-rules";
import {
  createRng,
  findCity,
  generateContracts,
  seedState,
} from "@fullcourt/game-engine";
import type { Position } from "@fullcourt/game-types";
import { ensureContractsFor } from "@/server/admin/offseason";
import type { UserContext } from "@/server/auth/session";
import { PAGE, allRows, loadStaff, previousFinish } from "./offseason-data";
import type { SeasonRow } from "./season-shared";

/**
 * Contracts and payroll, read for the offseason's steps (docs/DESIGN.md,
 * "Contracts and the cap"). Reads go through the owner's own session.
 */

export type PayrollPlayer = {
  id: string;
  teamId: string | null;
  rightsTeamId: string | null;
  salary: number | null;
  position: Position;
  age: number;
  overall: number;
  potential: number;
};

/** The first season a league ever played, which the cap counts from. */
export async function firstYear(
  ctx: UserContext,
  leagueId: string,
): Promise<number | null> {
  const { data, error } = await ctx.supabase
    .from("seasons")
    .select("year")
    .eq("league_id", leagueId)
    .order("year")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.year ?? null;
}

/** The salary cap for a season of the given year. */
export async function capForYear(
  ctx: UserContext,
  leagueId: string,
  year: number,
): Promise<number> {
  const first = await firstYear(ctx, leagueId);
  return salaryCap(first === null ? 0 : Math.max(0, year - first));
}

/** Every active player with his contract: on a team, or a free agent. */
export async function loadPayrollPlayers(
  ctx: UserContext,
  leagueId: string,
): Promise<PayrollPlayer[]> {
  const rows = await allRows((from, to) =>
    ctx.supabase
      .from("players")
      .select(
        "id, team_id, rights_team_id, salary, position, age, overall, potential",
      )
      .eq("league_id", leagueId)
      .eq("status", "active")
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({
    id: String(r.id),
    teamId: r.team_id ? String(r.team_id) : null,
    rightsTeamId: r.rights_team_id ? String(r.rights_team_id) : null,
    salary: r.salary === null ? null : Number(r.salary),
    position: r.position as Position,
    age: Number(r.age),
    overall: Number(r.overall),
    potential: Number(r.potential),
  }));
}

/** Each team's staff payroll. */
export async function staffPayrolls(
  ctx: UserContext,
  leagueId: string,
): Promise<Map<string, number>> {
  const staff = await loadStaff(ctx, leagueId);
  const out = new Map<string, number>();
  for (const s of staff) {
    if (s.teamId && !s.retired) {
      out.set(s.teamId, (out.get(s.teamId) ?? 0) + s.salary);
    }
  }
  return out;
}

/**
 * Each team's player payroll. Staff salaries are not part of it: staff are paid
 * from their own budget, so they never count against the cap or the ceiling.
 */
export function payrolls(
  players: readonly PayrollPlayer[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of players) {
    if (p.teamId && p.salary !== null) {
      out.set(p.teamId, (out.get(p.teamId) ?? 0) + p.salary);
    }
  }
  return out;
}

/** The teams that have used their mid-level exception in a season. */
export async function mleUsers(
  ctx: UserContext,
  leagueId: string,
  year: number,
): Promise<Set<string>> {
  const { data, error } = await ctx.supabase
    .from("player_transactions")
    .select("team_id")
    .eq("league_id", leagueId)
    .eq("season_year", year)
    .eq("route", "mle")
    .limit(PAGE);
  if (error) throw error;
  return new Set(data.flatMap((t) => (t.team_id ? [t.team_id] : [])));
}

/** A season's cap figures. */
export function figures(season: SeasonRow) {
  const cap = season.salary_cap;
  return {
    cap,
    ceiling: hardCeiling(cap),
    min: minSalary(cap),
    mle: midLevelException(cap),
  };
}

/**
 * Gives every player on a team a contract if the league has none yet (a league
 * made before contracts existed): salaries near each player's asking price, a
 * length that suits his age, and a payroll for each team between 85% and 105%
 * of the cap. The contracts are for the given season.
 */
export async function ensureContracts(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
): Promise<void> {
  const players = await loadPayrollPlayers(ctx, leagueId);
  const missing = players.filter((p) => p.teamId && p.salary === null);
  if (missing.length === 0) return;
  const rng = createRng(seedState(`${leagueId}:contracts:${season.year}`));
  const contracts = generateContracts(rng, {
    cap: season.salary_cap,
    year: season.year,
    players: missing.map((p) => ({
      id: p.id,
      teamId: p.teamId as string,
      age: p.age,
      overall: p.overall,
      potential: p.potential,
    })),
  });
  await ensureContractsFor(leagueId, contracts);
}

/** What a player asks for, in a season with this cap. */
export function ask(
  p: Pick<PayrollPlayer, "overall" | "potential" | "age">,
  cap: number,
) {
  return {
    salary: askingSalary(p, cap),
    years: Math.min(askingYears(p.age), maxYearsFor(p.age)),
  };
}

/** How each team looks to a free agent, apart from the money (docs/DESIGN.md). */
export type TeamAppeal = Omit<Appeal, "role">;

/**
 * Each team's winning (from how it finished the season before this offseason
 * and how far it got), its city (the team's place among the league's cities by
 * size) and its franchise history (titles, finals and playoff seasons over
 * the last eight seasons).
 */
export async function teamAppeals(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
): Promise<Map<string, TeamAppeal>> {
  const [finish, teams, recent] = await Promise.all([
    previousFinish(ctx, leagueId, season),
    ctx.supabase.from("teams").select("id, city_id").eq("league_id", leagueId),
    ctx.supabase
      .from("seasons")
      .select("id")
      .eq("league_id", leagueId)
      .not("archived_at", "is", null)
      .gte("year", season.year - 8)
      .lt("year", season.year),
  ]);
  if (teams.error) throw teams.error;
  if (recent.error) throw recent.error;
  const stats = recent.data.length
    ? await ctx.supabase
        .from("team_season_stats")
        .select("team_id, playoff_round, playoff_result")
        .in(
          "season_id",
          recent.data.map((r) => r.id),
        )
        .limit(PAGE)
    : { data: [], error: null };
  if (stats.error) throw stats.error;

  const n = finish.standingsOrder.length;
  const cityRank = new Map(
    [...teams.data]
      .map((t) => ({
        id: t.id,
        rank: t.city_id ? (findCity(t.city_id)?.rank ?? Infinity) : Infinity,
      }))
      .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
      .map((t, index) => [t.id, t.rank === Infinity ? null : index] as const),
  );
  const out = new Map<string, TeamAppeal>();
  for (const [index, teamId] of finish.standingsOrder.entries()) {
    const mine = stats.data.filter((r) => r.team_id === teamId);
    const rank = cityRank.get(teamId);
    out.set(teamId, {
      winning: winningScore(index + 1, n, finish.playoffDepth.get(teamId) ?? 0),
      market: rank === null || rank === undefined ? 0.5 : marketScore(rank, n),
      history: historyScore({
        titles: mine.filter((r) => r.playoff_result === "champion").length,
        finals: mine.filter((r) => r.playoff_result === "finalist").length,
        playoffs: mine.filter((r) => r.playoff_round !== null).length,
        missed: mine.filter((r) => r.playoff_round === null).length,
      }),
    });
  }
  return out;
}

/** The value of each team's players under contract, best first. */
export function rosterValues(
  players: readonly PayrollPlayer[],
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const p of players) {
    if (p.teamId) {
      out.set(p.teamId, [
        ...(out.get(p.teamId) ?? []),
        playerValue(p.overall, p.potential, p.age),
      ]);
    }
  }
  for (const [team, values] of out)
    out.set(
      team,
      values.sort((a, b) => b - a),
    );
  return out;
}
