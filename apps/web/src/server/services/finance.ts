import "server-only";
import {
  hardCeiling,
  midLevelException,
  minSalary,
  salaryCap,
} from "@fullcourt/game-rules";
import { askingSalary, askingYears, maxYearsFor } from "@fullcourt/game-rules";
import {
  createRng,
  generateContracts,
  seedState,
} from "@fullcourt/game-engine";
import type { Position } from "@fullcourt/game-types";
import { ensureContractsFor } from "@/server/admin/offseason";
import type { UserContext } from "@/server/auth/session";
import { PAGE, allRows, loadStaff } from "./offseason-data";
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

/** Each team's payroll: its players' salaries plus its staff's. */
export function payrolls(
  players: readonly PayrollPlayer[],
  staff: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>(staff);
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
  const [players, staff] = await Promise.all([
    loadPayrollPlayers(ctx, leagueId),
    staffPayrolls(ctx, leagueId),
  ]);
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
    staffPayroll: staff,
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
