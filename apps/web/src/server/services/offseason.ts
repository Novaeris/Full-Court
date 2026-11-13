import "server-only";
import {
  ageAndRetire,
  ageStaff,
  chooseCamp,
  createRng,
  fillRosters,
  generateStaff,
  hireStaff,
  coverRoster,
  replenishMarket,
  runCamp,
  seedState,
  type CampAssignment,
  type OffseasonPlayer as EnginePlayer,
  type NewStaff,
  type StaffMember as EngineStaff,
} from "@fullcourt/game-engine";
import {
  OFFSEASON_STAGES,
  RATING_KEYS,
  type CampProgram,
  type Position,
  type StaffRole,
} from "@fullcourt/game-types";
import {
  ROSTER_LIMITS,
  STAGE_LABELS,
  campPlaces,
  stageDates,
} from "@fullcourt/game-rules";
import type {
  CampReportRow,
  OffseasonPlayer,
  OffseasonResponse,
  Season,
} from "@fullcourt/validation";
import {
  addStaff,
  applyCamp,
  applyProgression,
  applyRosters,
  createStaff,
  releasePlayer,
  signPlayer,
  startSeason,
  type StaffInsert,
} from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import {
  PAGE,
  RATING_COLUMNS,
  allTeamIds,
  loadActivePlayers,
  loadStaff,
  ownedTeams,
  previousFinish,
  toCampPlayer,
  type OwnedTeam,
} from "./offseason-data";
import { ensureProspects, holdLotteryStep, simulatePicks } from "./draft";
import { latestSeason, seasonView, type SeasonRow } from "./season-shared";

/**
 * The offseason between two seasons (docs/DESIGN.md, "The offseason"). The
 * calculations are the engine's (packages/game-engine, offseason); this
 * service loads the league, runs a step with an RNG seeded from the league,
 * the step and the year, and stores the result in one transaction.
 *
 *   begin           (from a complete season) players age, some retire, staff turn over
 *   draft           the lottery and the draft                   -> free agency
 *   free-agency     rosters and the computer teams' staff       -> training camp
 *   training-camp   the camp is held                            -> preseason
 *   preseason       the regular season opens
 */

function staffInsert(s: NewStaff): StaffInsert {
  return {
    team_id: s.teamId,
    first_name: s.firstName,
    last_name: s.lastName,
    role: s.role,
    rating: s.rating,
    age: s.age,
    salary: s.salary,
    contract_years: s.contractYears,
  };
}

/**
 * Starts the offseason after an archived season: every player ages (some
 * retire), staff contracts run down and the staff market is topped up. Each
 * step runs once, so a retry after a failure skips what already happened. The
 * league gets its staff the first time.
 */
export async function beginOffseason(
  ctx: UserContext,
  leagueId: string,
  finished: SeasonRow,
): Promise<void> {
  let staff = await loadStaff(ctx, leagueId);
  if (staff.length === 0) {
    const teams = await allTeamIds(ctx, leagueId);
    const rng = createRng(seedState(`${leagueId}:staff`));
    await createStaff(
      leagueId,
      generateStaff(rng, teams, new Set()).map(staffInsert),
    );
    staff = await loadStaff(ctx, leagueId);
  }

  if (!finished.offseason_done_at) {
    const players = await loadActivePlayers(ctx, leagueId);
    const rng = createRng(seedState(`${leagueId}:ageing:${finished.year}`));
    const aged = ageAndRetire(rng, players);
    const staffChanged = ageStaff(rng, staff);
    await applyProgression({
      seasonId: finished.id,
      changes: aged.map((p) => {
        const ratings: Record<string, number> = {};
        for (const key of RATING_KEYS) {
          ratings[RATING_COLUMNS[key]] = p.ratings[key];
        }
        return {
          id: p.id,
          age: p.age,
          jersey: p.jersey,
          overall: p.overall,
          potential: p.potential,
          previous_overall: p.previousOverall,
          ...ratings,
          team_id: p.teamId,
          retired: p.retired,
        };
      }),
      staffChanges: staffChanged.map((s) => ({
        id: s.id,
        status: s.retired ? "retired" : "active",
        team_id: s.teamId,
        contract_years: s.contractYears,
      })),
    });
    staff = await loadStaff(ctx, leagueId);
  }

  // Top up the market so every role has people to choose from (idempotent).
  const rng = createRng(seedState(`${leagueId}:market:${finished.year}`));
  const market = staff.filter((s) => s.teamId === null && !s.retired);
  const taken = new Set(staff.map((s) => `${s.firstName} ${s.lastName}`));
  await addStaff(
    leagueId,
    replenishMarket(rng, market, taken).map(staffInsert),
  );
}

/** The rating of each team's staff member in a role, where it has one. */
function ratingOf(
  staff: readonly EngineStaff[],
  role: StaffRole,
): Map<string, number | null> {
  return new Map(
    staff
      .filter((s) => s.role === role && s.teamId !== null && !s.retired)
      .map((s) => [s.teamId as string, s.rating]),
  );
}

/** What the next button does in each stage, for the page. */
export const STAGE_ACTIONS: Record<
  (typeof OFFSEASON_STAGES)[number],
  { button: string; summary: string }
> = {
  draft: {
    button: "Hold the draft",
    summary:
      "The lottery is drawn and every team picks. Hire a scout first for a clearer draft board.",
  },
  "free-agency": {
    button: "End free agency",
    summary:
      "Teams sign free agents and the computer teams hire staff. Hire your own staff before you end it.",
  },
  "training-camp": {
    button: "Hold training camp",
    summary:
      "Choose who goes to camp and what they work on. Leave it empty and your coaches choose.",
  },
  preseason: {
    button: "Start the regular season",
    summary: "Rosters are final. The season opens on opening night.",
  },
};

type Rng = ReturnType<typeof createRng>;

/** Runs the current stage's step and moves the offseason on. */
export async function advanceOffseason(
  ctx: UserContext,
  leagueIdParam: string,
): Promise<Season> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  if (league.status !== "active") {
    throw new ApiError(
      409,
      "league_not_active",
      "Choose your team before simulating.",
    );
  }
  const season = await latestSeason(ctx, league.id);
  if (!season || season.phase !== "offseason" || !season.stage) {
    throw new ApiError(
      409,
      "not_in_offseason",
      "The league is not in an offseason.",
    );
  }
  const seed = (step: string) =>
    createRng(seedState(`${league.id}:${step}:${season.year}`));

  try {
    switch (season.stage) {
      case "draft": {
        // The lottery, then the computer teams pick until one of the owner's
        // teams is on the clock (the owner finishes it from the draft panel).
        await ensureProspects(ctx, league.id, season);
        const held = await ctx.supabase
          .from("draft_picks")
          .select("pick", { count: "exact", head: true })
          .eq("league_id", league.id)
          .eq("season_year", season.year);
        if (held.error) throw held.error;
        if ((held.count ?? 0) === 0) {
          await holdLotteryStep(ctx, league.id, season);
        } else {
          await simulatePicks(ctx, league.id, season, "advance");
        }
        break;
      }
      case "free-agency":
        await runFreeAgency(ctx, league.id, season, seed("free-agency"));
        break;
      case "training-camp":
        await runTrainingCamp(ctx, league.id, season, seed("camp"));
        break;
      case "preseason":
        await openSeason(ctx, league.id, season);
        break;
    }
  } catch (error) {
    const message = (error as { message?: string }).message;
    if (message === "wrong_stage") {
      throw new ApiError(
        409,
        "wrong_stage",
        "The offseason has already moved on.",
      );
    }
    if (message === "invalid_rosters" || message === "staff_over_budget") {
      throw new ApiError(
        409,
        message,
        "That step can't be taken as things stand.",
      );
    }
    throw error;
  }
  const next = await latestSeason(ctx, league.id);
  if (!next) throw new Error("The season is missing.");
  return seasonView(ctx, next);
}

/** A player's new team and jersey after some moves, compared with where they were. */
function applyChanges(
  players: readonly EnginePlayer[],
  moves: readonly { id: string; teamId: string | null; jersey: number }[],
): EnginePlayer[] {
  const by = new Map(moves.map((m) => [m.id, m]));
  return players.map((p) => {
    const m = by.get(p.id);
    return m ? { ...p, teamId: m.teamId, jersey: m.jersey } : p;
  });
}

/** The lowest jersey number the team's players don't wear. */
function freeNumber(players: readonly EnginePlayer[], teamId: string): number {
  const used = new Set(
    players.filter((p) => p.teamId === teamId).map((p) => p.jersey),
  );
  for (let n = 0; n < 100; n++) if (!used.has(n)) return n;
  return 0;
}

/** Applies coverRoster's releases and signings for one team to a working copy. */
function withCoverage(
  players: readonly EnginePlayer[],
  teamId: string,
): EnginePlayer[] {
  const roster = players.filter((p) => p.teamId === teamId);
  const pool = players.filter((p) => p.teamId === null);
  const { release, sign } = coverRoster({ roster, pool });
  let next = players.map((p) =>
    release.includes(p.id) ? { ...p, teamId: null } : p,
  );
  for (const id of sign) {
    const number = freeNumber(next, teamId);
    next = next.map((p) =>
      p.id === id ? { ...p, teamId, jersey: number } : p,
    );
  }
  return next;
}

/**
 * Makes sure each of the owner's teams has a legal roster before a stage can
 * end. A team on AI Assist (roster management or coverage) is fixed; any other
 * must already be legal, and if not the stage can't end.
 */
function checkOwnedRosters(
  players: readonly EnginePlayer[],
  owned: readonly OwnedTeam[],
): void {
  for (const team of owned) {
    const size = players.filter((p) => p.teamId === team.id).length;
    if (size < ROSTER_LIMITS.min || size > ROSTER_LIMITS.max) {
      throw new ApiError(
        409,
        "roster_not_legal",
        `Your roster has ${size} players and needs ${ROSTER_LIMITS.min} to ${ROSTER_LIMITS.max}. Sign or release players, or switch on Roster coverage in AI Assist.`,
      );
    }
  }
}

async function runFreeAgency(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
  rng: Rng,
): Promise<void> {
  const [finish, players, staff, owned] = await Promise.all([
    previousFinish(ctx, leagueId, season),
    loadActivePlayers(ctx, leagueId),
    loadStaff(ctx, leagueId),
    ownedTeams(ctx, leagueId),
  ]);
  const ownedIds = new Set(owned.map((t) => t.id));
  // The computer teams act, and so do the owner's teams whose roster
  // management is on AI Assist. Teams on roster coverage only are made legal
  // after the owner's own moves; any other of the owner's teams is untouched.
  const acting = new Set(
    finish.standingsOrder.filter(
      (t) =>
        !ownedIds.has(t) ||
        owned.find((o) => o.id === t)?.assist.rosterManagement,
    ),
  );
  let working = [...players];
  for (const team of owned) {
    if (team.assist.rosterCoverage && !team.assist.rosterManagement) {
      working = withCoverage(working, team.id);
    }
  }
  const moves = fillRosters(rng, {
    teams: finish.standingsOrder,
    players: working,
    acting,
  });
  const final = applyChanges(working, moves);
  checkOwnedRosters(final, owned);

  const before = new Map(players.map((p) => [p.id, p]));
  const changed = final.filter((p) => {
    const was = before.get(p.id) as EnginePlayer;
    return was.teamId !== p.teamId || was.jersey !== p.jersey;
  });

  // The owner decides their own staff; the computer teams hire, worst first.
  const hirers = [...finish.standingsOrder]
    .reverse()
    .filter((t) => !ownedIds.has(t));
  const hires = hireStaff(rng, { teams: hirers, staff });
  await applyRosters({
    seasonId: season.id,
    moves: changed.map((p) => ({
      id: p.id,
      team_id: p.teamId,
      jersey: p.jersey,
    })),
    staffMoves: hires.map((h) => ({
      id: h.id,
      team_id: h.teamId,
      contract_years: h.contractYears,
    })),
  });
}

/**
 * The preseason ends: the owner's teams on AI Assist are made legal with
 * releases and signings (each a small transaction), any other must already be,
 * and the season opens.
 */
async function openSeason(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
): Promise<void> {
  const [players, owned] = await Promise.all([
    loadActivePlayers(ctx, leagueId),
    ownedTeams(ctx, leagueId),
  ]);
  let working = [...players];
  for (const team of owned) {
    if (team.assist.rosterCoverage || team.assist.rosterManagement) {
      working = withCoverage(working, team.id);
    }
  }
  checkOwnedRosters(working, owned);
  const before = new Map(players.map((p) => [p.id, p]));
  for (const p of working) {
    const was = before.get(p.id) as EnginePlayer;
    if (was.teamId !== null && p.teamId === null) {
      await releasePlayer({
        seasonId: season.id,
        teamId: was.teamId,
        playerId: p.id,
      });
    }
  }
  for (const p of working) {
    const was = before.get(p.id) as EnginePlayer;
    if (was.teamId === null && p.teamId !== null) {
      await signPlayer({
        seasonId: season.id,
        teamId: p.teamId,
        playerId: p.id,
      });
    }
  }
  await startSeason(season.id);
}

async function runTrainingCamp(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
  rng: Rng,
): Promise<void> {
  const [players, staff, owned, saved] = await Promise.all([
    loadActivePlayers(ctx, leagueId),
    loadStaff(ctx, leagueId),
    ownedTeams(ctx, leagueId).then((t) => t.map((x) => x.id)),
    ctx.supabase
      .from("camp_assignments")
      .select("team_id, player_id, program")
      .eq("season_id", season.id),
  ]);
  if (saved.error) throw saved.error;

  const heads = ratingOf(staff, "head-coach");
  const byTeam = new Map<string, ReturnType<typeof toCampPlayer>[]>();
  for (const p of players) {
    if (!p.teamId) continue;
    byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), toCampPlayer(p)]);
  }
  const attendees = [];
  for (const [teamId, roster] of byTeam) {
    const chosen = saved.data.filter((a) => a.team_id === teamId);
    const assignments: CampAssignment[] =
      owned.includes(teamId) && chosen.length > 0
        ? chosen.map((a) => ({
            playerId: a.player_id,
            program: a.program as CampProgram,
          }))
        : chooseCamp(roster, campPlaces(heads.get(teamId) ?? null));
    for (const a of assignments) {
      const player = roster.find((p) => p.id === a.playerId);
      if (player) attendees.push({ ...player, program: a.program });
    }
  }
  const results = runCamp(rng, {
    attendees,
    developmentCoach: ratingOf(staff, "development-coach"),
    conditioningCoach: ratingOf(staff, "conditioning-coach"),
  });
  await applyCamp({
    seasonId: season.id,
    results: results.map((r) => {
      const ratings: Record<string, number> = {};
      for (const key of RATING_KEYS) {
        ratings[RATING_COLUMNS[key]] = r.ratings[key];
      }
      return {
        player_id: r.playerId,
        program: r.program,
        overall: r.overall,
        potential: r.potential,
        ...ratings,
      };
    }),
  });
}

type ReportRow = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  age: number;
  overall: number;
  potential: number;
  team_id: string | null;
};

function view(p: ReportRow): OffseasonPlayer {
  return {
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    position: p.position as Position,
    age: p.age,
    overall: p.overall,
    potential: p.potential,
    teamId: p.team_id,
  };
}

export const REPORT_COLUMNS =
  "id, first_name, last_name, position, age, overall, potential, team_id";

/** What the league's latest offseason did, and where the current one stands. */
export async function getOffseason(
  ctx: UserContext,
  leagueId: string,
): Promise<OffseasonResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  const [season, latest, latestCamp] = await Promise.all([
    latestSeason(ctx, league.id),
    ctx.supabase
      .from("draft_picks")
      .select("season_year")
      .eq("league_id", league.id)
      .order("season_year", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from("camp_results")
      .select("season_year")
      .eq("league_id", league.id)
      .order("season_year", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (latest.error) throw latest.error;
  if (latestCamp.error) throw latestCamp.error;

  const stage =
    season?.phase === "offseason"
      ? (season.stage as OffseasonResponse["stage"])
      : null;
  const stages =
    season && stage
      ? OFFSEASON_STAGES.map((s, i) => ({
          stage: s,
          label: STAGE_LABELS[s],
          ...stageDates(s, season.year),
          status: (i < OFFSEASON_STAGES.indexOf(stage)
            ? "done"
            : i === OFFSEASON_STAGES.indexOf(stage)
              ? "current"
              : "upcoming") as "done" | "current" | "upcoming",
        }))
      : [];

  const year = latest.data?.season_year ?? null;

  const campYear = latestCamp.data?.season_year ?? null;
  const campReport: CampReportRow[] = [];
  if (campYear !== null) {
    const results = await ctx.supabase
      .from("camp_results")
      .select("player_id, program, overall_before, overall_after")
      .eq("league_id", league.id)
      .eq("season_year", campYear)
      .limit(PAGE);
    if (results.error) throw results.error;
    const ids = results.data.map((r) => r.player_id);
    const players = ids.length
      ? await ctx.supabase
          .from("players")
          .select(REPORT_COLUMNS)
          .eq("league_id", league.id)
          .in("id", ids)
      : { data: [] as ReportRow[], error: null };
    if (players.error) throw players.error;
    const byId = new Map((players.data as ReportRow[]).map((p) => [p.id, p]));
    for (const r of results.data) {
      const p = byId.get(r.player_id);
      if (!p) continue;
      campReport.push({
        player: view(p),
        program: r.program as CampProgram,
        before: r.overall_before,
        after: r.overall_after,
      });
    }
    campReport.sort(
      (a, b) => b.after - b.before - (a.after - a.before) || b.after - a.after,
    );
  }

  // How far the offseason's own draft has got (null outside an offseason).
  let draftStatus: OffseasonResponse["draftStatus"] = null;
  if (season && stage) {
    const current = await ctx.supabase
      .from("draft_picks")
      .select("player_id")
      .eq("league_id", league.id)
      .eq("season_year", season.year)
      .limit(PAGE);
    if (current.error) throw current.error;
    draftStatus = {
      lotteryHeld: current.data.length > 0,
      made: current.data.filter((p) => p.player_id !== null).length,
      total: current.data.length,
    };
  }
  const base = { year, stage, stages, campReport, draftStatus };
  if (year === null) {
    return { ...base, draft: [], retired: [], risers: [], fallers: [] };
  }

  const [picks, retired, history] = await Promise.all([
    ctx.supabase
      .from("draft_picks")
      .select(
        "pick, round, team_id, player_id, finish_rank, expected_pick, lottery_odds",
      )
      .eq("league_id", league.id)
      .eq("season_year", year)
      .order("pick"),
    ctx.supabase
      .from("players")
      .select(REPORT_COLUMNS)
      .eq("league_id", league.id)
      .eq("retired_year", year)
      .order("overall", { ascending: false })
      .limit(100),
    ctx.supabase
      .from("player_ratings_history")
      .select("player_id, overall, previous_overall")
      .eq("league_id", league.id)
      .eq("season_year", year)
      .not("previous_overall", "is", null)
      .limit(PAGE),
  ]);
  if (picks.error) throw picks.error;
  if (retired.error) throw retired.error;
  if (history.error) throw history.error;

  const moves = history.data
    .map((h) => ({
      id: h.player_id,
      change: h.overall - (h.previous_overall ?? h.overall),
    }))
    .filter((m) => m.change !== 0);
  const risers = [...moves]
    .sort((a, b) => b.change - a.change)
    .slice(0, 5)
    .filter((m) => m.change > 0);
  const fallers = [...moves]
    .sort((a, b) => a.change - b.change)
    .slice(0, 5)
    .filter((m) => m.change < 0);

  const ids = [
    ...new Set([
      ...picks.data.flatMap((p) => (p.player_id ? [p.player_id] : [])),
      ...risers.map((m) => m.id),
      ...fallers.map((m) => m.id),
    ]),
  ];
  const found = ids.length
    ? await ctx.supabase
        .from("players")
        .select(REPORT_COLUMNS)
        .eq("league_id", league.id)
        .in("id", ids)
    : { data: [] as ReportRow[], error: null };
  if (found.error) throw found.error;
  const byId = new Map<string, ReportRow>(
    (found.data as ReportRow[]).map((p) => [p.id, p]),
  );
  const mover = (m: { id: string; change: number }) => {
    const row = byId.get(m.id);
    return row ? [{ ...view(row), change: m.change }] : [];
  };

  return {
    ...base,
    draft: picks.data.map((p) => {
      const row = p.player_id ? byId.get(p.player_id) : undefined;
      return {
        pick: p.pick,
        round: p.round,
        teamId: p.team_id,
        finishRank: p.finish_rank,
        expectedPick: p.expected_pick,
        lotteryOdds: p.lottery_odds,
        player: row ? view(row) : null,
      };
    }),
    retired: retired.data.map((p) => view(p as ReportRow)),
    risers: risers.flatMap(mover),
    fallers: fallers.flatMap(mover),
  };
}
