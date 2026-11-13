import "server-only";
import {
  createRng,
  seedState,
  simulateFreeAgencyDay,
  type FaPlayer,
  type FaTeam,
} from "@fullcourt/game-engine";
import {
  FREE_AGENCY_DAYS,
  addDays,
  askingSalary,
  effectiveSalary,
  maxSalary,
  maxYearsFor,
  minSalary,
  playerPriorities,
  playerValue,
  roleLabel,
  roleScore,
  signingRoute,
  topPriorities,
  stageDates,
} from "@fullcourt/game-rules";
import type { Position } from "@fullcourt/game-types";
import type {
  CapFigures,
  FaEvent,
  FaOffer,
  FreeAgencyResponse,
  MakeOfferRequest,
  OffseasonPlayer,
  SimFreeAgencyRequest,
  WithdrawOfferRequest,
} from "@fullcourt/validation";
import { applyFaDay, makeOffer, withdrawOffer } from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import {
  figures,
  loadPayrollPlayers,
  mleUsers,
  payrolls,
  rosterValues,
  teamAppeals,
} from "./finance";
import { getLeague, parseLeagueId } from "./leagues";
import { PAGE, ownedTeams } from "./offseason-data";
import { latestSeason, type SeasonRow } from "./season-shared";

/**
 * Free agency, a day at a time (docs/DESIGN.md, "Free agency day by day"). The
 * owner makes offers and simulates days; the computer teams (and the owner's
 * team when roster management is on AI Assist) make and raise offers each day,
 * and free agents decide. The day itself is the engine's
 * (`simulateFreeAgencyDay`); this loads the league, runs it with an RNG seeded
 * from the league, the year and the day, and stores the result atomically.
 */

const MARKET_SHOWN = 60;

type OfferRow = {
  id: string;
  player_id: string;
  team_id: string;
  salary: number;
  years: number;
  made_day: number;
  status: FaOffer["status"];
};

const view = (p: {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  team_id: string | null;
}): OffseasonPlayer => ({
  id: p.id,
  name: `${p.first_name} ${p.last_name}`,
  position: p.position as Position,
  age: p.age,
  overall: p.overall,
  potential: p.potential,
  teamId: p.team_id,
});

const REPORT_COLUMNS =
  "id, first_name, last_name, position, age, overall, potential, team_id";

async function resolveTeam(
  ctx: UserContext,
  leagueId: string,
  teamId: string | undefined,
) {
  const owned = await ownedTeams(ctx, leagueId);
  if (teamId === undefined) return owned[0] ?? null;
  const team = owned.find((t) => t.id === teamId);
  if (!team) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  return team;
}

function faOpen(season: SeasonRow | null): boolean {
  return (
    season?.phase === "offseason" &&
    season.stage === "free-agency" &&
    season.fa_day < FREE_AGENCY_DAYS
  );
}

/** Pending offers (every team's), for a season. */
async function pendingOffers(
  ctx: UserContext,
  seasonId: string,
): Promise<OfferRow[]> {
  const { data, error } = await ctx.supabase
    .from("fa_offers")
    .select("id, player_id, team_id, salary, years, made_day, status")
    .eq("season_id", seasonId)
    .eq("status", "pending")
    .limit(PAGE);
  if (error) throw error;
  return data as OfferRow[];
}

/** The cap figures for a team. */
export async function capFigures(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
  teamId: string,
): Promise<CapFigures> {
  const [players, used] = await Promise.all([
    loadPayrollPlayers(ctx, leagueId),
    mleUsers(ctx, leagueId, season.year),
  ]);
  const f = figures(season);
  const payroll = payrolls(players).get(teamId) ?? 0;
  return {
    cap: f.cap,
    ceiling: f.ceiling,
    payroll,
    room: f.cap - payroll,
    minSalary: f.min,
    maxSalary: maxSalary(f.cap),
    midLevel: f.mle,
    midLevelAvailable: !used.has(teamId),
  };
}

/** Free agency as one of your teams sees it. */
export async function getFreeAgency(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<FreeAgencyResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [team, season] = await Promise.all([
    resolveTeam(ctx, league.id, teamParam),
    latestSeason(ctx, league.id),
  ]);
  const teamId = team?.id ?? null;
  const empty: FreeAgencyResponse = {
    teamId,
    open: false,
    day: season?.fa_day ?? 0,
    days: FREE_AGENCY_DAYS,
    date: null,
    figures: null,
    appeal: null,
    freeAgents: [],
    freeAgentTotal: 0,
    myOffers: [],
    log: [],
  };
  if (!season || season.phase !== "offseason" || !teamId) return empty;

  const [players, offers, figs, appeals, transactions] = await Promise.all([
    loadPayrollPlayers(ctx, league.id),
    pendingOffers(ctx, season.id),
    capFigures(ctx, league.id, season, teamId),
    teamAppeals(ctx, league.id, season),
    ctx.supabase
      .from("player_transactions")
      .select("player_id, team_id, kind, day, salary, years")
      .eq("league_id", league.id)
      .eq("season_year", season.year)
      .in("kind", [
        "signed",
        "re-signed",
        "released",
        "contract-ended",
        "drafted",
      ])
      .order("day", { ascending: false })
      .order("id", { ascending: false })
      .limit(40),
  ]);
  if (transactions.error) throw transactions.error;

  const market = players
    .filter((p) => p.teamId === null)
    .sort(
      (a, b) =>
        playerValue(b.overall, b.potential, b.age) -
          playerValue(a.overall, a.potential, a.age) ||
        a.id.localeCompare(b.id),
    );
  const shown = market.slice(0, MARKET_SHOWN);
  const ids = [
    ...new Set([
      ...shown.map((p) => p.id),
      ...offers.filter((o) => o.team_id === teamId).map((o) => o.player_id),
      ...transactions.data.map((t) => t.player_id),
    ]),
  ];
  const rows = ids.length
    ? await ctx.supabase
        .from("players")
        .select(REPORT_COLUMNS)
        .eq("league_id", league.id)
        .in("id", ids)
    : { data: [], error: null };
  if (rows.error) throw rows.error;
  const byId = new Map(rows.data.map((r) => [r.id, view(r)]));

  const mine = offers.filter((o) => o.team_id === teamId);
  const myValues = rosterValues(players).get(teamId) ?? [];
  const myAppeal = appeals.get(teamId) ?? {
    winning: 0.5,
    market: 0.5,
    history: 0.5,
  };
  const roleFor = (p: { overall: number; potential: number; age: number }) =>
    roleScore(playerValue(p.overall, p.potential, p.age), myValues);
  const worthOf = (o: OfferRow): number | null => {
    const p = players.find((x) => x.id === o.player_id);
    if (!p) return null;
    const price = askingSalary(p, season.salary_cap);
    return (
      effectiveSalary(o.salary, playerPriorities(p.id), {
        ...myAppeal,
        role: roleFor(p),
        history: Math.min(
          1,
          myAppeal.history + (p.rightsTeamId === teamId ? 0.3 : 0),
        ),
      }) / price
    );
  };
  const offerView = (o: OfferRow): FaOffer | null => {
    const player = byId.get(o.player_id);
    return player
      ? {
          worth: worthOf(o),
          id: o.id,
          player,
          salary: o.salary,
          years: o.years,
          madeDay: o.made_day,
          status: o.status,
        }
      : null;
  };
  const days = season.stage === "free-agency" ? season.fa_day : 0;
  const start = stageDates("free-agency", season.year).start;
  return {
    teamId,
    open: faOpen(season),
    day: season.fa_day,
    days: FREE_AGENCY_DAYS,
    date:
      season.stage === "free-agency"
        ? addDays(start, Math.min(days, 20))
        : null,
    figures: figs,
    appeal: myAppeal,
    freeAgents: shown.flatMap((p) => {
      const v = byId.get(p.id);
      if (!v) return [];
      const price = askingSalary(p, season.salary_cap);
      const o = mine.find((x) => x.player_id === p.id);
      return [
        {
          ...v,
          askSalary: price,
          askYears: Math.min(maxYearsFor(p.age), 5),
          yours: p.rightsTeamId === teamId,
          priorities: topPriorities(playerPriorities(p.id)),
          role: roleLabel(roleFor(p)),
          offer: o ? offerView(o) : null,
          otherOffers: offers.filter(
            (x) => x.player_id === p.id && x.team_id !== teamId,
          ).length,
        },
      ];
    }),
    freeAgentTotal: market.length,
    myOffers: mine.flatMap((o) => {
      const v = offerView(o);
      return v ? [v] : [];
    }),
    log: transactions.data.flatMap((t): FaEvent[] => {
      const player = byId.get(t.player_id);
      return player
        ? [
            {
              day: t.day,
              kind: t.kind as FaEvent["kind"],
              player,
              teamId: t.team_id,
              salary: t.salary,
              years: t.years,
            },
          ]
        : [];
    }),
  };
}

/** Makes or changes your offer to a free agent. */
export async function makeFaOffer(
  ctx: UserContext,
  leagueIdParam: string,
  input: MakeOfferRequest,
): Promise<FreeAgencyResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const team = await resolveTeam(ctx, league.id, input.teamId);
  if (!team) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  const season = await latestSeason(ctx, league.id);
  if (!faOpen(season) || !season) {
    throw new ApiError(
      409,
      "wrong_stage",
      "Offers can be made during the 21 days of free agency.",
    );
  }
  const [players, used] = await Promise.all([
    loadPayrollPlayers(ctx, league.id),
    mleUsers(ctx, league.id, season.year),
  ]);
  const player = players.find((p) => p.id === input.playerId);
  if (!player || player.teamId !== null) {
    throw new ApiError(409, "player_not_available", "He isn't a free agent.");
  }
  const cap = season.salary_cap;
  if (input.salary < minSalary(cap) || input.salary > maxSalary(cap)) {
    throw new ApiError(
      422,
      "salary_out_of_range",
      `A salary runs from ${minSalary(cap)}K to ${maxSalary(cap)}K a year.`,
    );
  }
  if (input.years > maxYearsFor(player.age)) {
    throw new ApiError(
      422,
      "contract_too_long",
      `He won't sign for more than ${maxYearsFor(player.age)} years.`,
    );
  }
  const payroll = payrolls(players).get(team.id) ?? 0;
  const route = signingRoute({
    payroll,
    salary: input.salary,
    cap,
    rights: player.rightsTeamId === team.id,
    mleAvailable: !used.has(team.id),
  });
  if (!route) {
    const ceiling = Math.round(cap * 1.2);
    throw new ApiError(
      422,
      "cannot_afford",
      payroll + input.salary > ceiling
        ? "That would take your payroll over the hard ceiling."
        : "You are over the cap for that: it needs cap room, a minimum contract, his old team's re-signing rights, or the mid-level exception.",
    );
  }
  try {
    await makeOffer({
      seasonId: season.id,
      teamId: team.id,
      playerId: input.playerId,
      salary: input.salary,
      years: input.years,
    });
  } catch (error) {
    const message = (error as { message?: string }).message;
    if (message === "over_ceiling") {
      throw new ApiError(
        422,
        "cannot_afford",
        "That would take your payroll over the hard ceiling.",
      );
    }
    if (message === "player_not_available") {
      throw new ApiError(409, "player_not_available", "He isn't a free agent.");
    }
    throw error;
  }
  return getFreeAgency(ctx, league.id, team.id);
}

/** Withdraws one of your pending offers. */
export async function withdrawFaOffer(
  ctx: UserContext,
  leagueIdParam: string,
  input: WithdrawOfferRequest,
): Promise<FreeAgencyResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const team = await resolveTeam(ctx, league.id, input.teamId);
  const season = await latestSeason(ctx, league.id);
  if (!team || !season) {
    throw new ApiError(404, "team_not_found", "You don't run a team here.");
  }
  const offers = await pendingOffers(ctx, season.id);
  if (!offers.some((o) => o.id === input.offerId && o.team_id === team.id)) {
    throw new ApiError(404, "offer_not_found", "That offer isn't pending.");
  }
  await withdrawOffer(season.id, input.offerId);
  return getFreeAgency(ctx, league.id, team.id);
}

/**
 * Plays one day of free agency for the league: the computer teams' offers, the
 * free agents' decisions, and the day's signings, stored atomically.
 */
export async function runFaDay(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
): Promise<void> {
  const [players, owned, offers, used, teams, appeals] = await Promise.all([
    loadPayrollPlayers(ctx, leagueId),
    ownedTeams(ctx, leagueId),
    pendingOffers(ctx, season.id),
    mleUsers(ctx, leagueId, season.year),
    ctx.supabase.from("teams").select("id").eq("league_id", leagueId),
    teamAppeals(ctx, leagueId, season),
  ]);
  const values = rosterValues(players);
  if (teams.error) throw teams.error;
  const day = season.fa_day + 1;
  const pay = payrolls(players);
  const ownedOn = new Set(
    owned.filter((t) => t.assist.rosterManagement).map((t) => t.id),
  );
  const ownedAll = new Set(owned.map((t) => t.id));

  const faTeams: FaTeam[] = teams.data.map((t) => ({
    id: t.id,
    payroll: pay.get(t.id) ?? 0,
    positions: players.filter((p) => p.teamId === t.id).map((p) => p.position),
    mleUsed: used.has(t.id),
    acting: !ownedAll.has(t.id) || ownedOn.has(t.id),
    winning: appeals.get(t.id)?.winning ?? 0.5,
    market: appeals.get(t.id)?.market ?? 0.5,
    history: appeals.get(t.id)?.history ?? 0.5,
    values: values.get(t.id) ?? [],
  }));
  const faPlayers: FaPlayer[] = players
    .filter((p) => p.teamId === null)
    .map((p) => ({
      id: p.id,
      position: p.position,
      age: p.age,
      overall: p.overall,
      potential: p.potential,
      rightsTeamId: p.rightsTeamId,
    }));

  const rng = createRng(seedState(`${leagueId}:fa:${season.year}:${day}`));
  const result = simulateFreeAgencyDay(rng, {
    day,
    cap: season.salary_cap,
    players: faPlayers,
    teams: faTeams,
    offers: offers.map((o) => ({
      id: o.id,
      playerId: o.player_id,
      teamId: o.team_id,
      salary: o.salary,
      years: o.years,
    })),
  });

  // Offers made today get their ids here, so signings and lapses can name them.
  const ids = new Map(
    result.newOffers.map((o) => [o.ref, crypto.randomUUID()]),
  );
  const idOf = (ref: string) => ids.get(ref) ?? ref;
  await applyFaDay({
    seasonId: season.id,
    newOffers: result.newOffers.map((o) => ({
      id: ids.get(o.ref),
      player_id: o.playerId,
      team_id: o.teamId,
      salary: o.salary,
      years: o.years,
    })),
    raised: result.raised.map((r) => ({ id: r.offerId, salary: r.salary })),
    signings: result.signings.map((s) => ({
      offer_id: idOf(s.offerRef),
      player_id: s.playerId,
      team_id: s.teamId,
      salary: s.salary,
      years: s.years,
      route: s.route,
    })),
    lapsed: result.lapsed.map((l) => ({
      id: idOf(l.offerRef),
      status: l.reason === "signed-elsewhere" ? "outbid" : "void",
    })),
  });
}

/** Plays days of free agency until the 21st (or the number asked for). */
export async function playFaDays(
  ctx: UserContext,
  leagueId: string,
  days: number,
): Promise<void> {
  for (let i = 0; i < days; i++) {
    const season = await latestSeason(ctx, leagueId);
    if (!faOpen(season) || !season) return;
    await runFaDay(ctx, leagueId, season);
  }
}

/** Simulates a day, a week, or the rest of free agency. */
export async function simFreeAgency(
  ctx: UserContext,
  leagueIdParam: string,
  input: SimFreeAgencyRequest,
): Promise<FreeAgencyResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = await latestSeason(ctx, league.id);
  if (!faOpen(season)) {
    throw new ApiError(
      409,
      "wrong_stage",
      "Free agency isn't open, or its 21 days are over.",
    );
  }
  const n = input.days === "end" ? FREE_AGENCY_DAYS : input.days;
  await playFaDays(ctx, league.id, n);
  return getFreeAgency(ctx, league.id);
}
