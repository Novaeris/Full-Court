import "server-only";
import {
  ROSTER_LIMITS,
  askingSalary,
  lateSigningPrice,
  maxYearsFor,
  minSalary,
  signingRoute,
} from "@fullcourt/game-rules";
import type { Position } from "@fullcourt/game-types";
import type {
  AiAssistResponse,
  FreeAgent,
  RosterMoveRequest,
  RosterPlayer,
  RosterResponse,
  UpdateAiAssistRequest,
} from "@fullcourt/validation";
import {
  releasePlayer,
  setAiAssist,
  signPlayer,
} from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { capFigures } from "./freeagency";
import {
  loadPayrollPlayers,
  mleUsers,
  payrolls,
  staffPayrolls,
} from "./finance";
import { getLeague, parseLeagueId } from "./leagues";
import { ownedTeams } from "./offseason-data";
import { latestSeason } from "./season-shared";

/**
 * The owner's roster moves (release and sign) and AI Assist switches
 * (docs/DESIGN.md, "AI Assist" and "Contracts and the cap"). Moves are open
 * from free agency to the end of the preseason. During free agency a free agent
 * is signed by making an offer (see freeagency.ts); here only a player who would
 * take a minimum contract can be signed outright, and once the 21 days are over
 * anyone can be, at 75% of his asking price for a year.
 */

const FREE_AGENTS_SHOWN = 40;

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  team_id: string | null;
  salary?: number | null;
  contract_expires?: number | null;
};

const COLUMNS =
  "id, first_name, last_name, position, age, overall, potential, team_id, salary, contract_expires";

const base = (p: Row) => ({
  id: p.id,
  name: `${p.first_name} ${p.last_name}`,
  position: p.position as Position,
  age: p.age,
  overall: p.overall,
  potential: p.potential,
  teamId: p.team_id,
});

/** The team to act for: the one asked for if the user runs it, else their first. */
async function resolveTeam(
  ctx: UserContext,
  leagueId: string,
  teamId: string | undefined,
): Promise<string | null> {
  const owned = await ownedTeams(ctx, leagueId);
  if (teamId === undefined) return owned[0]?.id ?? null;
  if (!owned.some((t) => t.id === teamId)) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  return teamId;
}

/** One of your rosters with contracts, the cap figures and the best free agents. */
export async function getRoster(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<RosterResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [teamId, season] = await Promise.all([
    resolveTeam(ctx, league.id, teamParam),
    latestSeason(ctx, league.id),
  ]);
  const [roster, free] = await Promise.all([
    teamId
      ? ctx.supabase
          .from("players")
          .select(COLUMNS)
          .eq("league_id", league.id)
          .eq("team_id", teamId)
          .eq("status", "active")
          .order("overall", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    ctx.supabase
      .from("players")
      .select(`${COLUMNS}, rights_team_id`, { count: "exact" })
      .eq("league_id", league.id)
      .eq("status", "active")
      .is("team_id", null)
      .order("overall", { ascending: false })
      .order("id")
      .limit(FREE_AGENTS_SHOWN),
  ]);
  if (roster.error) throw roster.error;
  if (free.error) throw free.error;
  const cap = season?.salary_cap ?? 125000;
  const players: RosterPlayer[] = (roster.data as Row[]).map((p) => ({
    ...base(p),
    salary: p.salary ?? null,
    expires: p.contract_expires ?? null,
  }));
  const freeAgents: FreeAgent[] = (
    free.data as unknown as (Row & { rights_team_id: string | null })[]
  ).map((p) => ({
    ...base(p),
    askSalary: askingSalary(p, cap),
    askYears: Math.min(maxYearsFor(p.age), 5),
    yours: p.rights_team_id === teamId,
  }));
  return {
    teamId,
    open:
      season?.phase === "offseason" &&
      ["free-agency", "training-camp", "preseason"].includes(
        season.stage ?? "",
      ),
    min: ROSTER_LIMITS.min,
    max: ROSTER_LIMITS.max,
    figures:
      season && teamId
        ? await capFigures(ctx, league.id, season, teamId)
        : null,
    players,
    freeAgents,
    freeAgentTotal: free.count ?? free.data.length,
  };
}

function refusal(error: unknown): never {
  const message = (error as { message?: string }).message;
  const known: Record<string, [number, string]> = {
    wrong_stage: [
      409,
      "Players can be signed and released from free agency to the end of the preseason.",
    ],
    roster_full: [409, "A roster holds at most 15 players."],
    player_not_available: [409, "That player isn't a free agent."],
    player_not_found: [404, "That player isn't on your roster."],
    over_ceiling: [422, "That would take your payroll over the hard ceiling."],
  };
  const hit = message ? known[message] : undefined;
  if (hit) throw new ApiError(hit[0], message as string, hit[1]);
  throw error;
}

async function seasonForMoves(ctx: UserContext, leagueId: string) {
  const season = await latestSeason(ctx, leagueId);
  if (!season || season.phase !== "offseason") {
    throw new ApiError(
      409,
      "wrong_stage",
      "Players can be signed and released from free agency to the end of the preseason.",
    );
  }
  return season;
}

/**
 * Signs a free agent outright. In free agency only a player who would take a
 * minimum contract can be (anyone else needs an offer); after its 21 days
 * anyone can, at 75% of his asking price for one year, if the cap rules allow.
 */
export async function signFreeAgent(
  ctx: UserContext,
  leagueIdParam: string,
  input: RosterMoveRequest,
): Promise<RosterResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveTeam(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  const season = await seasonForMoves(ctx, league.id);
  const [players, staff, used] = await Promise.all([
    loadPayrollPlayers(ctx, league.id),
    staffPayrolls(ctx, league.id),
    mleUsers(ctx, league.id, season.year),
  ]);
  const player = players.find((p) => p.id === input.playerId);
  if (!player || player.teamId !== null) {
    throw new ApiError(
      409,
      "player_not_available",
      "That player isn't a free agent.",
    );
  }
  const cap = season.salary_cap;
  const price = askingSalary(player, cap);
  const duringDays = season.stage === "free-agency" && season.fa_day < 21;
  if (duringDays && price > minSalary(cap) * 1.3) {
    throw new ApiError(
      409,
      "use_offers",
      "Free agency is on: make him an offer, and simulate a day.",
    );
  }
  const salary = duringDays ? minSalary(cap) : lateSigningPrice(price, cap);
  const payroll = payrolls(players, staff).get(teamId) ?? 0;
  const route = signingRoute({
    payroll,
    salary,
    cap,
    rights: player.rightsTeamId === teamId,
    mleAvailable: !used.has(teamId),
  });
  if (!route) {
    throw new ApiError(
      422,
      "cannot_afford",
      "You can't fit him in: you are over the cap (a minimum contract, his old team's rights or the mid-level exception are the ways around it) or at the hard ceiling.",
    );
  }
  try {
    await signPlayer({
      seasonId: season.id,
      teamId,
      playerId: input.playerId,
      salary,
      years: 1,
    });
  } catch (error) {
    refusal(error);
  }
  return getRoster(ctx, league.id, teamId);
}

/** Releases a player from your roster into free agency. */
export async function releaseFromRoster(
  ctx: UserContext,
  leagueIdParam: string,
  input: RosterMoveRequest,
): Promise<RosterResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveTeam(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  const season = await seasonForMoves(ctx, league.id);
  try {
    await releasePlayer({
      seasonId: season.id,
      teamId,
      playerId: input.playerId,
    });
  } catch (error) {
    refusal(error);
  }
  return getRoster(ctx, league.id, teamId);
}

/** Switches AI Assist on or off for a franchise you run. */
export async function updateAiAssist(
  ctx: UserContext,
  leagueIdParam: string,
  input: UpdateAiAssistRequest,
): Promise<AiAssistResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const teamId = await resolveTeam(ctx, league.id, input.teamId);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  await setAiAssist(teamId, input.aiAssist as Record<string, boolean>);
  const team = (await ownedTeams(ctx, league.id)).find((t) => t.id === teamId);
  return { teamId, aiAssist: (team as NonNullable<typeof team>).assist };
}
