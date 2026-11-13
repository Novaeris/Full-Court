import "server-only";
import {
  ageAndRetire,
  ageStaff,
  chooseCamp,
  createRng,
  fillRosters,
  generateStaff,
  hireStaff,
  holdDraft,
  replenishMarket,
  runCamp,
  seedState,
  type CampAssignment,
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
import { STAGE_LABELS, campPlaces, stageDates } from "@fullcourt/game-rules";
import type {
  CampReportRow,
  OffseasonPlayer,
  OffseasonResponse,
  Season,
} from "@fullcourt/validation";
import {
  addStaff,
  applyCamp,
  applyDraft,
  applyProgression,
  applyRosters,
  createStaff,
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
  loadPlayerNames,
  loadStaff,
  ownedTeamIds,
  previousFinish,
  toCampPlayer,
} from "./offseason-data";
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
      case "draft":
        await runDraft(ctx, league.id, season, seed("draft"));
        break;
      case "free-agency":
        await runFreeAgency(ctx, league.id, season, seed("free-agency"));
        break;
      case "training-camp":
        await runTrainingCamp(ctx, league.id, season, seed("camp"));
        break;
      case "preseason":
        await startSeason(season.id);
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

async function runDraft(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
  rng: Rng,
): Promise<void> {
  const [finish, names, staff] = await Promise.all([
    previousFinish(ctx, leagueId, season),
    loadPlayerNames(ctx, leagueId),
    loadStaff(ctx, leagueId),
  ]);
  const { rookies, lottery } = holdDraft(rng, {
    standingsOrder: finish.standingsOrder,
    playoffDepth: finish.playoffDepth,
    takenNames: names,
    scouts: ratingOf(staff, "scout"),
  });
  await applyDraft({
    seasonId: season.id,
    changes: rookies.map((r) => {
      const ratings: Record<string, number> = {};
      for (const key of RATING_KEYS) {
        ratings[RATING_COLUMNS[key]] = r.ratings[key];
      }
      return {
        id: crypto.randomUUID(),
        first_name: r.firstName,
        last_name: r.lastName,
        position: r.position,
        age: r.age,
        height_inches: r.heightInches,
        weight_pounds: r.weightPounds,
        jersey: r.jersey,
        overall: r.overall,
        potential: r.potential,
        ...ratings,
        team_id: r.teamId,
        draft_round: r.draft?.round ?? null,
        draft_pick: r.draft?.pick ?? null,
        draft_team_id: r.draft?.teamId ?? null,
      };
    }),
    lottery: lottery.map((l) => ({
      team_id: l.teamId,
      finish_rank: l.finishRank,
      expected_pick: l.expectedPick,
      odds: l.odds,
    })),
  });
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
    ownedTeamIds(ctx, leagueId),
  ]);
  const moves = fillRosters(rng, { teams: finish.standingsOrder, players });
  // The owner decides their own staff; the computer teams hire, worst first.
  const hirers = [...finish.standingsOrder]
    .reverse()
    .filter((t) => !owned.includes(t));
  const hires = hireStaff(rng, { teams: hirers, staff });
  await applyRosters({
    seasonId: season.id,
    moves: moves.map((m) => ({
      id: m.id,
      team_id: m.teamId,
      jersey: m.jersey,
    })),
    staffMoves: hires.map((h) => ({
      id: h.id,
      team_id: h.teamId,
      contract_years: h.contractYears,
    })),
  });
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
    ownedTeamIds(ctx, leagueId),
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

  const base = { year, stage, stages, campReport };
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
      ...picks.data.map((p) => p.player_id),
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
    draft: picks.data.flatMap((p) => {
      const row = byId.get(p.player_id);
      return row
        ? [
            {
              pick: p.pick,
              round: p.round,
              teamId: p.team_id,
              finishRank: p.finish_rank,
              expectedPick: p.expected_pick,
              lotteryOdds: p.lottery_odds,
              player: view(row),
            },
          ]
        : [];
    }),
    retired: retired.data.map((p) => view(p as ReportRow)),
    risers: risers.flatMap(mover),
    fallers: fallers.flatMap(mover),
  };
}
