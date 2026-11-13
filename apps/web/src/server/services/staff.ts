import "server-only";
import { STAFF_BUDGET, STAFF_ROLE_INFO } from "@fullcourt/game-rules";
import type {
  HireStaffRequest,
  ReleaseStaffRequest,
  StaffMember,
  StaffResponse,
} from "@fullcourt/validation";
import { hireStaffMember, releaseStaffMember } from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { loadStaff, ownedTeamIds } from "./offseason-data";
import { latestSeason } from "./season-shared";

/**
 * Staff for the owner's team: who is on it, who is on the market, and hiring
 * and releasing during an offseason (docs/DESIGN.md, "Staff").
 */

/** The team to act for: the one asked for if the user runs it, else their first. */
export async function resolveOwnedTeam(
  ctx: UserContext,
  leagueId: string,
  teamId: string | undefined,
): Promise<string | null> {
  const owned = await ownedTeamIds(ctx, leagueId);
  if (teamId === undefined) return owned[0] ?? null;
  if (!owned.includes(teamId)) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  return teamId;
}

function view(s: Awaited<ReturnType<typeof loadStaff>>[number]): StaffMember {
  return {
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    role: s.role,
    rating: s.rating,
    age: s.age,
    salary: s.salary,
    teamId: s.teamId,
    contractYears: s.contractYears,
  };
}

/** Your team's staff and the market, with the budget. */
export async function getStaff(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<StaffResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [teamId, season, staff] = await Promise.all([
    resolveOwnedTeam(ctx, league.id, teamParam),
    latestSeason(ctx, league.id),
    loadStaff(ctx, league.id),
  ]);
  const active = staff.filter((s) => !s.retired);
  const team = active.filter((s) => teamId !== null && s.teamId === teamId);
  const order = (s: StaffMember) =>
    Object.keys(STAFF_ROLE_INFO).indexOf(s.role);
  return {
    teamId,
    budget: STAFF_BUDGET,
    payroll: team.reduce((sum, s) => sum + s.salary, 0),
    team: team.map(view).sort((a, b) => order(a) - order(b)),
    market: active
      .filter((s) => s.teamId === null)
      .map(view)
      .sort((a, b) => order(a) - order(b) || b.rating - a.rating),
    open: season?.phase === "offseason",
  };
}

function refusal(error: unknown): never {
  const message = (error as { message?: string }).message;
  const known: Record<string, [number, string]> = {
    wrong_stage: [409, "Staff can only be hired during the offseason."],
    staff_over_budget: [409, "That would take the team over its staff budget."],
    staff_not_available: [409, "That person has already been hired."],
    staff_not_found: [404, "That staff member isn't in this league."],
  };
  const hit = message ? known[message] : undefined;
  if (hit) throw new ApiError(hit[0], message as string, hit[1]);
  throw error;
}

async function currentOffseasonId(
  ctx: UserContext,
  leagueId: string,
): Promise<string> {
  const season = await latestSeason(ctx, leagueId);
  if (!season || season.phase !== "offseason") {
    throw new ApiError(
      409,
      "wrong_stage",
      "Staff can only be hired during the offseason.",
    );
  }
  return season.id;
}

/** Hires a free agent into his role on your team. Whoever held it goes to the market. */
export async function hireStaff(
  ctx: UserContext,
  leagueIdParam: string,
  input: HireStaffRequest,
): Promise<StaffResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveOwnedTeam(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  const seasonId = await currentOffseasonId(ctx, league.id);
  try {
    await hireStaffMember({
      seasonId,
      staffId: input.staffId,
      teamId,
      years: input.years,
    });
  } catch (error) {
    refusal(error);
  }
  return getStaff(ctx, league.id, teamId);
}

/** Lets one of your team's staff go; he joins the market. */
export async function releaseStaff(
  ctx: UserContext,
  leagueIdParam: string,
  input: ReleaseStaffRequest,
): Promise<StaffResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveOwnedTeam(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  const staff = await loadStaff(ctx, league.id);
  if (!staff.some((s) => s.id === input.staffId && s.teamId === teamId)) {
    throw new ApiError(404, "staff_not_found", "He isn't on your staff.");
  }
  const seasonId = await currentOffseasonId(ctx, league.id);
  try {
    await releaseStaffMember({ seasonId, staffId: input.staffId });
  } catch (error) {
    refusal(error);
  }
  return getStaff(ctx, league.id, teamId);
}
