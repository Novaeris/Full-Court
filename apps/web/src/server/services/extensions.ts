import "server-only";
import {
  EXTENSION_MAX_YEARS_LEFT,
  askingSalary,
  askingYears,
  extensionAccepts,
  extensionFactor,
  extensionMood,
  extensionWorth,
  maxSalary,
  maxYearsFor,
  minSalary,
  minimumExtension,
  playerPriorities,
  playerValue,
  roleScore,
} from "@fullcourt/game-rules";
import type { Position } from "@fullcourt/game-types";
import type {
  ExtendRequest,
  ExtendResult,
  ExtensionsResponse,
} from "@fullcourt/validation";
import { extendContract } from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { capFigures } from "./freeagency";
import { loadPayrollPlayers, rosterValues, teamAppeals } from "./finance";
import { getLeague, parseLeagueId } from "./leagues";
import { ownedTeams } from "./offseason-data";
import { latestSeason, type SeasonRow } from "./season-shared";

/**
 * Extending a contract (docs/DESIGN.md, "Extending a contract"): the owner gives
 * a player of their team a new contract before his old one ends. He agrees when
 * the offer is worth at least what he asks, by his own preferences, and the
 * team stays under the hard ceiling.
 */

function open(season: SeasonRow | null): boolean {
  return (
    season?.phase === "regular-season" ||
    (season?.phase === "offseason" &&
      ["free-agency", "training-camp", "preseason"].includes(
        season.stage ?? "",
      ))
  );
}

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  salary: number | null;
  contract_expires: number | null;
};

const COLUMNS =
  "id, first_name, last_name, position, age, overall, potential, salary, contract_expires";

async function resolveOwned(
  ctx: UserContext,
  leagueId: string,
  teamParam: string | undefined,
): Promise<string | null> {
  const owned = await ownedTeams(ctx, leagueId);
  if (teamParam === undefined) return owned[0]?.id ?? null;
  if (!owned.some((t) => t.id === teamParam)) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  return teamParam;
}

/**
 * How teams look to their players, from last season's finish and the league's
 * history. A league's first season has no last season: until there is a record,
 * every team looks average (an empty map; callers fall back to 0.5).
 */
async function appealsFor(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
) {
  const previous = await ctx.supabase
    .from("seasons")
    .select("id")
    .eq("league_id", leagueId)
    .eq("year", season.year - 1)
    .maybeSingle();
  if (previous.error) throw previous.error;
  if (!previous.data) return new Map<string, never>();
  return teamAppeals(ctx, leagueId, season);
}

/** How each of the team's players sees an extension, for those who can be extended. */
async function candidatesOf(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
  teamId: string,
) {
  const [rows, everyone, appeals] = await Promise.all([
    ctx.supabase
      .from("players")
      .select(COLUMNS)
      .eq("league_id", leagueId)
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("overall", { ascending: false })
      .order("id"),
    loadPayrollPlayers(ctx, leagueId),
    appealsFor(ctx, leagueId, season),
  ]);
  if (rows.error) throw rows.error;
  const values = rosterValues(everyone).get(teamId) ?? [];
  const base = appeals.get(teamId) ?? {
    winning: 0.5,
    market: 0.5,
    history: 0.5,
  };
  const cap = season.salary_cap;

  return (rows.data as Row[]).flatMap((p) => {
    if (p.salary === null || p.contract_expires === null) return [];
    const yearsLeft = p.contract_expires - season.year + 1;
    if (yearsLeft > EXTENSION_MAX_YEARS_LEFT) return [];
    const ask = askingSalary(p, cap);
    const appeal = {
      ...base,
      role: roleScore(playerValue(p.overall, p.potential, p.age), values),
      // He already plays here: that counts for the team's history, as it does for a re-signing.
      history: Math.min(1, base.history + 0.3),
    };
    const priorities = playerPriorities(p.id);
    const maxYears = Math.min(maxYearsFor(p.age), 5);
    return [
      {
        row: p,
        yearsLeft,
        ask,
        askYears: Math.min(askingYears(p.age), maxYears),
        maxYears,
        priorities,
        appeal,
      },
    ];
  });
}

export async function getExtensions(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<ExtensionsResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [teamId, season] = await Promise.all([
    resolveOwned(ctx, league.id, teamParam),
    latestSeason(ctx, league.id),
  ]);
  const isOpen = open(season);
  if (!teamId || !season) {
    return { teamId, open: false, figures: null, candidates: [] };
  }
  const found = await candidatesOf(ctx, league.id, season, teamId);
  const cap = season.salary_cap;
  return {
    teamId,
    open: isOpen,
    figures: await capFigures(ctx, league.id, season, teamId),
    candidates: found.map((c) => ({
      player: {
        id: c.row.id,
        name: `${c.row.first_name} ${c.row.last_name}`,
        position: c.row.position as Position,
        age: c.row.age,
        overall: c.row.overall,
        potential: c.row.potential,
        teamId,
      },
      salary: c.row.salary as number,
      expires: c.row.contract_expires as number,
      yearsLeft: c.yearsLeft,
      askSalary: c.ask,
      askYears: c.askYears,
      maxYears: c.maxYears,
      // The least he signs for, kept within what a contract can be.
      minimum: Math.min(
        maxSalary(cap),
        Math.max(
          minSalary(cap),
          minimumExtension(c.ask, c.priorities, c.appeal),
        ),
      ),
      mood: extensionMood(extensionFactor(c.priorities, c.appeal)),
    })),
  };
}

/** Offers a player an extension; it is made if he agrees and the team can pay it. */
export async function extendPlayer(
  ctx: UserContext,
  leagueIdParam: string,
  input: ExtendRequest,
): Promise<ExtendResult> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [teamId, season] = await Promise.all([
    resolveOwned(ctx, league.id, input.teamId),
    latestSeason(ctx, league.id),
  ]);
  if (!teamId) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  if (!season || !open(season)) {
    throw new ApiError(
      409,
      "extensions_closed",
      "Contracts can be extended in the season and from free agency to the preseason.",
    );
  }
  const candidate = (await candidatesOf(ctx, league.id, season, teamId)).find(
    (c) => c.row.id === input.playerId,
  );
  if (!candidate) {
    throw new ApiError(
      422,
      "not_extendable",
      "Only players on your team with two years or fewer left can be extended.",
    );
  }
  const cap = season.salary_cap;
  if (input.salary < minSalary(cap) || input.salary > maxSalary(cap)) {
    throw new ApiError(
      422,
      "invalid_contract",
      "That salary is outside what a contract can be.",
    );
  }
  if (input.years > candidate.maxYears) {
    throw new ApiError(
      422,
      "invalid_contract",
      `A player of ${candidate.row.age} can sign for at most ${candidate.maxYears} years.`,
    );
  }
  if (
    season.year + input.years - 1 <=
    (candidate.row.contract_expires as number)
  ) {
    throw new ApiError(
      422,
      "not_an_extension",
      "An extension has to run longer than his contract does now.",
    );
  }

  const worth = extensionWorth(
    input.salary,
    candidate.ask,
    candidate.priorities,
    candidate.appeal,
  );
  const extensions = await getExtensions(ctx, league.id, teamId);
  if (!extensionAccepts(worth)) {
    const least =
      extensions.candidates.find((c) => c.player.id === input.playerId)
        ?.minimum ?? candidate.ask;
    return {
      done: false,
      worth,
      reason: `He turns it down. He would sign for at least $${(least / 1000).toFixed(2)}M.`,
      extensions,
    };
  }
  try {
    await extendContract({
      seasonId: season.id,
      playerId: input.playerId,
      salary: input.salary,
      years: input.years,
    });
  } catch (error) {
    const message = (error as { message?: string }).message;
    if (message === "over_ceiling") {
      throw new ApiError(
        409,
        "over_ceiling",
        "That would take your payroll past the hard ceiling.",
      );
    }
    if (message === "extensions_closed" || message === "player_not_on_team") {
      throw new ApiError(
        409,
        message,
        "That extension can't be made as things stand.",
      );
    }
    throw error;
  }
  return {
    done: true,
    worth,
    reason: null,
    extensions: await getExtensions(ctx, league.id, teamId),
  };
}
