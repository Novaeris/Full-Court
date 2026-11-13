import "server-only";
import { shopPlayers } from "@fullcourt/game-engine";
import {
  answerTrade,
  dealWords,
  hardCeiling,
  tradeDeadlineDay,
  tradeProblems,
  tradeValue,
  type TradeAsset,
} from "@fullcourt/game-rules";
import type { Position } from "@fullcourt/game-types";
import type {
  OffseasonPlayer,
  ShopRequest,
  ShopResponse,
  TradeEvaluation,
  TradePartnerResponse,
  TradePlayer,
  TradeProposal,
  TradeRecord,
  TradeResult,
  TradesResponse,
} from "@fullcourt/validation";
import { applyTrade } from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { allRows, ownedTeams } from "./offseason-data";
import { latestSeason, type SeasonRow } from "./season-shared";

/**
 * Trades (docs/DESIGN.md, "Trades and roster moves in the season"): the owner
 * proposes and the computer teams answer. The rules are
 * `packages/game-rules/src/season/trade.ts`; the database holds the roster
 * limits, the hard ceiling and the window.
 */

type Row = {
  id: string;
  team_id: string | null;
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
  "id, team_id, first_name, last_name, position, age, overall, potential, salary, contract_expires";

const base = (r: Row): OffseasonPlayer => ({
  id: r.id,
  name: `${r.first_name} ${r.last_name}`,
  position: r.position as Position,
  age: r.age,
  overall: r.overall,
  potential: r.potential,
  teamId: r.team_id,
});

/** Every active player on a team, with his contract. */
async function rosterRows(
  ctx: UserContext,
  leagueId: string,
  teamIds?: readonly string[],
): Promise<Row[]> {
  const rows = await allRows((from, to) => {
    let q = ctx.supabase
      .from("players")
      .select(COLUMNS)
      .eq("league_id", leagueId)
      .eq("status", "active")
      .not("team_id", "is", null);
    if (teamIds) q = q.in("team_id", [...teamIds]);
    return q.order("id").range(from, to);
  });
  return rows as unknown as Row[];
}

function assetOf(r: Row, season: SeasonRow): TradeAsset {
  return {
    id: r.id,
    position: r.position,
    age: r.age,
    overall: r.overall,
    potential: r.potential,
    salary: r.salary ?? 0,
    yearsLeft: Math.max(
      1,
      (r.contract_expires ?? season.year) - season.year + 1,
    ),
  };
}

function tradePlayer(r: Row, season: SeasonRow): TradePlayer {
  const a = assetOf(r, season);
  return {
    ...base(r),
    salary: a.salary,
    yearsLeft: a.yearsLeft,
    value: Math.round(tradeValue(a, season.salary_cap)),
  };
}

/** Whether trades are open now, and if not why. */
function window(season: SeasonRow | null): {
  open: boolean;
  reason: string | null;
  deadlineDay: number | null;
  inSeason: boolean;
} {
  if (!season) {
    return {
      open: false,
      reason: "There is no season yet.",
      deadlineDay: null,
      inSeason: false,
    };
  }
  if (season.phase === "offseason") {
    const open = ["free-agency", "training-camp", "preseason"].includes(
      season.stage ?? "",
    );
    return {
      open,
      reason: open ? null : "Trades open when free agency does.",
      deadlineDay: null,
      inSeason: false,
    };
  }
  if (season.phase === "regular-season") {
    const deadline = tradeDeadlineDay(season.last_day);
    const open = season.day <= deadline;
    return {
      open,
      reason: open ? null : "The trade deadline has passed.",
      deadlineDay: deadline,
      inSeason: true,
    };
  }
  return {
    open: false,
    reason: "There are no trades in the playoffs or after the season.",
    deadlineDay: null,
    inSeason: false,
  };
}

async function resolveTeam(
  ctx: UserContext,
  leagueId: string,
  teamId: string | undefined,
): Promise<string> {
  const owned = await ownedTeams(ctx, leagueId);
  const id = teamId ?? owned[0]?.id;
  if (!id || !owned.some((t) => t.id === id)) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  return id;
}

const payrollOf = (rows: readonly Row[], teamId: string) =>
  rows
    .filter((r) => r.team_id === teamId)
    .reduce((s, r) => s + (r.salary ?? 0), 0);

/** Your roster, the teams you can trade with, and recent trades. */
export async function getTrades(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<TradesResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const owned = await ownedTeams(ctx, league.id);
  const season = await latestSeason(ctx, league.id);
  const teamId = teamParam ?? owned[0]?.id ?? null;
  if (teamParam !== undefined && !owned.some((t) => t.id === teamParam)) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  const w = window(season);
  const rows = await rosterRows(ctx, league.id);
  const ownedIds = new Set(owned.map((t) => t.id));
  const teams = await ctx.supabase
    .from("teams")
    .select("id")
    .eq("league_id", league.id);
  if (teams.error) throw teams.error;

  const trades = await ctx.supabase
    .from("trades")
    .select("id, season_year, day, team_a, team_b, gave_a, gave_b")
    .eq("league_id", league.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (trades.error) throw trades.error;
  const ids = [
    ...new Set(trades.data.flatMap((t) => [...t.gave_a, ...t.gave_b])),
  ];
  const traded = ids.length
    ? await ctx.supabase
        .from("players")
        .select(COLUMNS)
        .eq("league_id", league.id)
        .in("id", ids)
    : { data: [] as Row[], error: null };
  if (traded.error) throw traded.error;
  const byId = new Map((traded.data as Row[]).map((p) => [p.id, base(p)]));
  const named = (list: string[]) =>
    list.flatMap((id) => {
      const p = byId.get(id);
      return p ? [p] : [];
    });
  const history: TradeRecord[] = trades.data.map((t) => ({
    id: t.id,
    seasonYear: t.season_year,
    day: t.day,
    teamA: t.team_a,
    teamB: t.team_b,
    gaveA: named(t.gave_a),
    gaveB: named(t.gave_b),
  }));

  return {
    teamId,
    open: w.open && teamId !== null,
    closedReason: w.reason,
    deadlineDay: w.deadlineDay,
    day: season?.day ?? 0,
    cap: season?.salary_cap ?? 125000,
    payroll: teamId ? payrollOf(rows, teamId) : 0,
    roster:
      season && teamId
        ? rows
            .filter((r) => r.team_id === teamId)
            .map((r) => tradePlayer(r, season))
            .sort((a, b) => b.value - a.value)
        : [],
    partners: teams.data
      .filter((t) => !ownedIds.has(t.id))
      .map((t) => ({
        teamId: t.id,
        payroll: payrollOf(rows, t.id),
        size: rows.filter((r) => r.team_id === t.id).length,
      })),
    history,
  };
}

/** A computer team's roster with contracts. */
export async function getTradePartner(
  ctx: UserContext,
  leagueIdParam: string,
  partnerId: string,
): Promise<TradePartnerResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [season, owned] = await Promise.all([
    latestSeason(ctx, league.id),
    ownedTeams(ctx, league.id),
  ]);
  if (!season || owned.some((t) => t.id === partnerId)) {
    throw new ApiError(
      404,
      "team_not_found",
      "That isn't a team you can trade with.",
    );
  }
  const rows = await rosterRows(ctx, league.id, [partnerId]);
  if (rows.length === 0) {
    throw new ApiError(
      404,
      "team_not_found",
      "That isn't a team you can trade with.",
    );
  }
  return {
    teamId: partnerId,
    payroll: payrollOf(rows, partnerId),
    roster: rows
      .map((r) => tradePlayer(r, season))
      .sort((a, b) => b.value - a.value),
  };
}

/** Judges a proposal: legal, and what the computer team would say. */
async function judge(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
  input: TradeProposal,
): Promise<{ evaluation: TradeEvaluation; mine: string }> {
  const mine = await resolveTeam(ctx, leagueId, input.teamId);
  const owned = await ownedTeams(ctx, leagueId);
  if (owned.some((t) => t.id === input.partnerId)) {
    throw new ApiError(422, "own_team", "You can't trade with your own team.");
  }
  const w = window(season);
  if (!w.open)
    throw new ApiError(409, "trades_closed", w.reason ?? "Trades are closed.");

  const rows = await rosterRows(ctx, leagueId, [mine, input.partnerId]);
  const mineRows = rows.filter((r) => r.team_id === mine);
  const theirRows = rows.filter((r) => r.team_id === input.partnerId);
  if (theirRows.length === 0) {
    throw new ApiError(
      404,
      "team_not_found",
      "That team isn't in this league.",
    );
  }
  const give = mineRows.filter((r) => input.give.includes(r.id));
  const get = theirRows.filter((r) => input.get.includes(r.id));
  if (give.length !== input.give.length || get.length !== input.get.length) {
    throw new ApiError(
      422,
      "player_not_on_team",
      "Every player has to be on the team that gives him.",
    );
  }
  const cap = season.salary_cap;
  const sum = (list: readonly Row[]) =>
    list.reduce((s, r) => s + (r.salary ?? 0), 0);
  const assets = (list: readonly Row[]) => list.map((r) => assetOf(r, season));

  const problems = tradeProblems({
    a: {
      payroll: sum(mineRows),
      size: mineRows.length,
      out: assets(give),
      in: assets(get),
    },
    b: {
      payroll: sum(theirRows),
      size: theirRows.length,
      out: assets(get),
      in: assets(give),
    },
    cap,
    ceiling: hardCeiling(cap),
    inSeason: w.inSeason,
  });
  const verdict = answerTrade({
    team: assets(theirRows),
    gives: assets(get),
    receives: assets(give),
    cap,
    inSeason: w.inSeason,
  });
  return {
    mine,
    evaluation: {
      legal: problems.length === 0,
      problems,
      accepts: verdict.accepts,
      reasons: verdict.reasons,
      deal: dealWords(verdict.receives, verdict.gives),
      payrollAfter: {
        yours: sum(mineRows) - sum(give) + sum(get),
        theirs: sum(theirRows) - sum(get) + sum(give),
      },
    },
  };
}

/** What would happen if this trade were proposed. */
export async function evaluateTrade(
  ctx: UserContext,
  leagueIdParam: string,
  input: TradeProposal,
): Promise<TradeEvaluation> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = await latestSeason(ctx, league.id);
  if (!season)
    throw new ApiError(409, "trades_closed", "There is no season yet.");
  return (await judge(ctx, league.id, season, input)).evaluation;
}

/** Makes the trade if it is legal and the computer team accepts. */
export async function proposeTrade(
  ctx: UserContext,
  leagueIdParam: string,
  input: TradeProposal,
): Promise<TradeResult> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = await latestSeason(ctx, league.id);
  if (!season)
    throw new ApiError(409, "trades_closed", "There is no season yet.");
  const { evaluation, mine } = await judge(ctx, league.id, season, input);
  if (!evaluation.legal || !evaluation.accepts) {
    return { evaluation, done: false };
  }
  try {
    await applyTrade({
      seasonId: season.id,
      teamA: mine,
      teamB: input.partnerId,
      fromA: input.give,
      fromB: input.get,
    });
  } catch (error) {
    const message = (error as { message?: string }).message;
    if (
      message === "trades_closed" ||
      message === "invalid_rosters" ||
      message === "over_ceiling" ||
      message === "player_not_on_team"
    ) {
      throw new ApiError(
        409,
        message,
        "That trade can't be made as things stand.",
      );
    }
    throw error;
  }
  return { evaluation, done: true };
}

/** What the computer teams would give for some of your players. */
export async function shopTradePlayers(
  ctx: UserContext,
  leagueIdParam: string,
  input: ShopRequest,
): Promise<ShopResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = await latestSeason(ctx, league.id);
  const mine = await resolveTeam(ctx, league.id, input.teamId);
  const w = window(season);
  if (!season || !w.open) {
    throw new ApiError(409, "trades_closed", w.reason ?? "Trades are closed.");
  }
  const owned = await ownedTeams(ctx, league.id);
  const ownedIds = new Set(owned.map((t) => t.id));
  const rows = await rosterRows(ctx, league.id);
  const mineRows = rows.filter((r) => r.team_id === mine);
  const picked = mineRows.filter((r) => input.playerIds.includes(r.id));
  if (picked.length !== input.playerIds.length) {
    throw new ApiError(
      422,
      "player_not_on_team",
      "Those players aren't all on your roster.",
    );
  }
  const teamIds = [
    ...new Set(
      rows.flatMap((r) =>
        r.team_id && !ownedIds.has(r.team_id) ? [r.team_id] : [],
      ),
    ),
  ];
  const offers = shopPlayers({
    assets: picked.map((r) => assetOf(r, season)),
    teams: teamIds.map((id) => ({
      id,
      payroll: payrollOf(rows, id),
      roster: rows
        .filter((r) => r.team_id === id)
        .map((r) => assetOf(r, season)),
    })),
    owner: {
      payroll: payrollOf(rows, mine),
      roster: mineRows.map((r) => assetOf(r, season)),
    },
    cap: season.salary_cap,
    inSeason: w.inSeason,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    offers: offers.map((o) => ({
      teamId: o.teamId,
      get: o.get.flatMap((a) => {
        const r = byId.get(a.id);
        return r ? [tradePlayer(r, season)] : [];
      }),
      deal: dealWords(o.receives, o.gives),
    })),
  };
}
