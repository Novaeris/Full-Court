import "server-only";
import {
  chooseProspect,
  classSize,
  createRng,
  drawLottery,
  generateDraftClass,
  scoutedView,
  seedState,
  suggestProspect,
  type ProspectView,
} from "@fullcourt/game-engine";
import {
  RATING_KEYS,
  type Position,
  type StaffRole,
} from "@fullcourt/game-types";
import { rookieContract } from "@fullcourt/game-rules";
import type {
  DraftPickRequest,
  DraftResponse,
  DraftSimRequest,
  OffseasonPlayer,
  Prospect,
} from "@fullcourt/validation";
import {
  createProspects,
  holdLottery,
  makePicks,
} from "@/server/admin/offseason";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import {
  RATING_COLUMNS,
  loadActivePlayers,
  loadPlayerNames,
  loadStaff,
  ownedTeams,
  previousFinish,
  type OwnedTeam,
} from "./offseason-data";
import { latestSeason, type SeasonRow } from "./season-shared";

/**
 * The draft, a pick at a time (docs/DESIGN.md, "The draft"). The class exists
 * from the start of the offseason as players with the status `prospect`; the
 * lottery stores the order; picks are made in order, by the computer teams and
 * by the owner for the teams they run (unless that team's drafting is on AI
 * Assist). Each pick seeds its own RNG from the league, the year and the pick
 * number, so a pick is the same however the draft is batched.
 */

type Rng = ReturnType<typeof createRng>;

type Slot = {
  pick: number;
  round: number;
  team_id: string;
  player_id: string | null;
  finish_rank: number;
  expected_pick: number;
  lottery_odds: number | null;
};

type ProspectRow = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  age: number;
  height_inches: number;
  weight_pounds: number;
  overall: number;
  potential: number;
};

const PROSPECT_COLUMNS =
  "id, first_name, last_name, position, age, height_inches, weight_pounds, overall, potential";

function currentDraftSeason(season: SeasonRow | null): SeasonRow {
  if (!season || season.phase !== "offseason") {
    throw new ApiError(409, "wrong_stage", "There is no draft to hold.");
  }
  if (season.stage !== "draft") {
    throw new ApiError(409, "wrong_stage", "The draft is over.");
  }
  return season;
}

/** Creates the draft class if the offseason doesn't have one yet. */
export async function ensureProspects(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
): Promise<void> {
  const existing = await ctx.supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId)
    .eq("draft_year", season.year);
  if (existing.error) throw existing.error;
  if ((existing.count ?? 0) > 0) return;

  const [teams, names] = await Promise.all([
    ctx.supabase.from("teams").select("id").eq("league_id", leagueId),
    loadPlayerNames(ctx, leagueId),
  ]);
  if (teams.error) throw teams.error;
  const rng = createRng(seedState(`${leagueId}:class:${season.year}`));
  const class_ = generateDraftClass(rng, classSize(teams.data.length), names);
  await createProspects(
    season.id,
    class_.map((r) => {
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
        overall: r.overall,
        potential: r.potential,
        ...ratings,
      };
    }),
  );
}

async function loadSlots(ctx: UserContext, leagueId: string, year: number) {
  const { data, error } = await ctx.supabase
    .from("draft_picks")
    .select(
      "pick, round, team_id, player_id, finish_rank, expected_pick, lottery_odds",
    )
    .eq("league_id", leagueId)
    .eq("season_year", year)
    .order("pick");
  if (error) throw error;
  return data as Slot[];
}

async function loadProspects(
  ctx: UserContext,
  leagueId: string,
  year: number,
): Promise<ProspectRow[]> {
  const { data, error } = await ctx.supabase
    .from("players")
    .select(PROSPECT_COLUMNS)
    .eq("league_id", leagueId)
    .eq("status", "prospect")
    .eq("draft_year", year)
    .order("id");
  if (error) throw error;
  return data as ProspectRow[];
}

const toView = (p: ProspectRow): ProspectView => ({
  id: p.id,
  position: p.position as Position,
  age: p.age,
  overall: p.overall,
  potential: p.potential,
});

function ratingOf(
  staff: Awaited<ReturnType<typeof loadStaff>>,
  role: StaffRole,
): Map<string, number | null> {
  return new Map(
    staff
      .filter((s) => s.role === role && s.teamId !== null && !s.retired)
      .map((s) => [s.teamId as string, s.rating]),
  );
}

/** Holds the lottery: the order of every pick, drawn from how teams finished. */
export async function holdLotteryStep(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
): Promise<void> {
  const finish = await previousFinish(ctx, leagueId, season);
  const rng = createRng(seedState(`${leagueId}:lottery:${season.year}`));
  const slots = drawLottery(rng, finish.standingsOrder, finish.playoffDepth);
  await holdLottery(
    season.id,
    slots.map((s) => ({
      pick: s.pick,
      round: s.round,
      team_id: s.teamId,
      finish_rank: s.finishRank,
      expected_pick: s.expectedPick,
      odds: s.odds,
    })),
  );
}

export type SimMode = "my-pick" | "advance" | "auto";

/**
 * Makes the computer teams' picks, in order. It stops at the next pick of a
 * team the owner runs when `mode` is `my-pick` (always, so the owner can take
 * it themselves, with AI Assist or not) or `advance` (only if that team's
 * drafting is not on AI Assist); `auto` never stops. Returns the picks made.
 */
export async function simulatePicks(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
  mode: SimMode,
): Promise<number> {
  const [slots, prospects, players, staff, owned] = await Promise.all([
    loadSlots(ctx, leagueId, season.year),
    loadProspects(ctx, leagueId, season.year),
    loadActivePlayers(ctx, leagueId),
    loadStaff(ctx, leagueId),
    ownedTeams(ctx, leagueId),
  ]);
  const mine = new Map(owned.map((t) => [t.id, t]));
  const scouts = ratingOf(staff, "scout");
  const positions = new Map<string, Position[]>();
  for (const p of players) {
    if (p.teamId) {
      positions.set(p.teamId, [...(positions.get(p.teamId) ?? []), p.position]);
    }
  }
  const available = new Map(prospects.map((p) => [p.id, toView(p)]));
  const batch: {
    pick: number;
    player_id: string;
    salary: number;
    years: number;
  }[] = [];
  for (const slot of slots.filter((s) => s.player_id === null)) {
    const team = mine.get(slot.team_id);
    if (
      team &&
      (mode === "my-pick" || (mode === "advance" && !team.assist.drafting))
    )
      break;
    if (available.size === 0) break;
    const rng: Rng = createRng(
      seedState(`${leagueId}:pick:${season.year}:${slot.pick}`),
    );
    const id = chooseProspect(rng, {
      prospects: [...available.values()],
      rosterPositions: positions.get(slot.team_id) ?? [],
      scout: scouts.get(slot.team_id) ?? null,
    });
    const taken = available.get(id) as ProspectView;
    available.delete(id);
    positions.set(slot.team_id, [
      ...(positions.get(slot.team_id) ?? []),
      taken.position,
    ]);
    const deal = rookieContract(slot.pick, slot.round, season.salary_cap);
    batch.push({
      pick: slot.pick,
      player_id: id,
      salary: deal.salary,
      years: deal.years,
    });
  }
  if (batch.length > 0) await makePicks(season.id, batch);
  return batch.length;
}

const flag = (t: OwnedTeam | undefined) => t?.assist.drafting ?? false;

/** The draft as one of your teams sees it. */
export async function getDraft(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<DraftResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const [season, owned] = await Promise.all([
    latestSeason(ctx, league.id),
    ownedTeams(ctx, league.id),
  ]);
  if (teamParam !== undefined && !owned.some((t) => t.id === teamParam)) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  const team = owned.find((t) => t.id === (teamParam ?? owned[0]?.id));
  const teamId = team?.id ?? null;
  const open = season?.phase === "offseason" && season.stage === "draft";
  const empty: DraftResponse = {
    teamId,
    open: false,
    lotteryHeld: false,
    year: season?.year ?? null,
    onTheClock: null,
    suggestion: null,
    order: [],
    board: [],
  };
  if (!season || season.phase !== "offseason") return empty;

  await ensureProspects(ctx, league.id, season);
  const [slots, prospects, players, staff] = await Promise.all([
    loadSlots(ctx, league.id, season.year),
    loadProspects(ctx, league.id, season.year),
    loadActivePlayers(ctx, league.id),
    loadStaff(ctx, league.id),
  ]);

  const madeIds = slots.flatMap((s) => (s.player_id ? [s.player_id] : []));
  const picked = madeIds.length
    ? await ctx.supabase
        .from("players")
        .select(
          "id, first_name, last_name, position, age, overall, potential, team_id",
        )
        .eq("league_id", league.id)
        .in("id", madeIds)
    : { data: [], error: null };
  if (picked.error) throw picked.error;
  const byId = new Map(picked.data.map((p) => [p.id, p]));
  const player = (id: string | null): OffseasonPlayer | null => {
    const p = id ? byId.get(id) : undefined;
    return p
      ? {
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          position: p.position as Position,
          age: p.age,
          overall: p.overall,
          potential: p.potential,
          teamId: p.team_id,
        }
      : null;
  };

  const scout = teamId ? (ratingOf(staff, "scout").get(teamId) ?? null) : null;
  const onTheClockSlot = open
    ? slots.find((s) => s.player_id === null)
    : undefined;
  const board: Prospect[] = open
    ? prospects
        .map((p) => {
          const seen = teamId
            ? scoutedView(toView(p), teamId, scout)
            : { overall: p.overall, potential: p.potential };
          return {
            id: p.id,
            name: `${p.first_name} ${p.last_name}`,
            position: p.position as Prospect["position"],
            age: p.age,
            heightInches: p.height_inches,
            weightPounds: p.weight_pounds,
            overall: seen.overall,
            potential: seen.potential,
          };
        })
        .sort((a, b) => b.overall + b.potential - (a.overall + a.potential))
    : [];
  const rosterPositions = players
    .filter((p) => p.teamId === teamId)
    .map((p) => p.position);

  return {
    teamId,
    open,
    lotteryHeld: slots.length > 0,
    year: season.year,
    onTheClock: onTheClockSlot
      ? {
          pick: onTheClockSlot.pick,
          round: onTheClockSlot.round,
          teamId: onTheClockSlot.team_id,
          yourPick:
            owned.some((t) => t.id === onTheClockSlot.team_id) &&
            !flag(owned.find((t) => t.id === onTheClockSlot.team_id)),
          mine: owned.some((t) => t.id === onTheClockSlot.team_id),
        }
      : null,
    suggestion:
      open && teamId && prospects.length > 0
        ? suggestProspect({
            prospects: prospects.map(toView),
            teamId,
            rosterPositions,
            scout,
          })
        : null,
    order: slots.map((s) => ({
      pick: s.pick,
      round: s.round,
      teamId: s.team_id,
      finishRank: s.finish_rank,
      expectedPick: s.expected_pick,
      lotteryOdds: s.lottery_odds,
      player: player(s.player_id),
    })),
    board,
  };
}

function refusal(error: unknown): never {
  const message = (error as { message?: string }).message;
  const known: Record<string, [number, string]> = {
    lottery_not_held: [409, "The lottery hasn't been held yet."],
    lottery_already_held: [409, "The lottery has already been held."],
    pick_out_of_order: [409, "That pick isn't next."],
    prospect_not_available: [409, "That prospect has already been taken."],
    wrong_stage: [409, "The draft is over."],
  };
  const hit = message ? known[message] : undefined;
  if (hit) throw new ApiError(hit[0], message as string, hit[1]);
  throw error;
}

/** Holds the lottery for the offseason's draft. */
export async function holdLotteryAction(
  ctx: UserContext,
  leagueIdParam: string,
): Promise<DraftResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = currentDraftSeason(await latestSeason(ctx, league.id));
  try {
    await ensureProspects(ctx, league.id, season);
    await holdLotteryStep(ctx, league.id, season);
  } catch (error) {
    refusal(error);
  }
  return getDraft(ctx, league.id);
}

/** Makes your team's pick, when it is on the clock. */
export async function pickProspect(
  ctx: UserContext,
  leagueIdParam: string,
  input: DraftPickRequest,
): Promise<DraftResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = currentDraftSeason(await latestSeason(ctx, league.id));
  const owned = await ownedTeams(ctx, league.id);
  const slots = await loadSlots(ctx, league.id, season.year);
  const next = slots.find((s) => s.player_id === null);
  if (slots.length === 0) {
    throw new ApiError(
      409,
      "lottery_not_held",
      "The lottery hasn't been held yet.",
    );
  }
  if (!next || !owned.some((t) => t.id === next.team_id)) {
    throw new ApiError(409, "not_your_pick", "It isn't your pick.");
  }
  if (input.teamId !== undefined && input.teamId !== next.team_id) {
    throw new ApiError(409, "not_your_pick", "That team isn't on the clock.");
  }
  try {
    const deal = rookieContract(next.pick, next.round, season.salary_cap);
    await makePicks(season.id, [
      {
        pick: next.pick,
        player_id: input.prospectId,
        salary: deal.salary,
        years: deal.years,
      },
    ]);
  } catch (error) {
    refusal(error);
  }
  return getDraft(ctx, league.id, next.team_id);
}

/** The computer teams pick until one of yours is on the clock; `mode` says where to stop (see DraftSimRequestSchema). */
export async function simDraft(
  ctx: UserContext,
  leagueIdParam: string,
  input: DraftSimRequest,
): Promise<DraftResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const season = currentDraftSeason(await latestSeason(ctx, league.id));
  try {
    await ensureProspects(ctx, league.id, season);
    if ((await loadSlots(ctx, league.id, season.year)).length === 0) {
      await holdLotteryStep(ctx, league.id, season);
    }
    await simulatePicks(ctx, league.id, season, input.mode);
  } catch (error) {
    refusal(error);
  }
  return getDraft(ctx, league.id);
}
