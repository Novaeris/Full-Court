import "server-only";
import { createRng, runOffseason, seedState } from "@fullcourt/game-engine";
import type { OffseasonPlayer as EnginePlayer } from "@fullcourt/game-engine";
import {
  RATING_KEYS,
  type Position,
  type Ratings,
} from "@fullcourt/game-types";
import type { OffseasonPlayer, OffseasonResponse } from "@fullcourt/validation";
import { applyOffseason } from "@/server/admin/season";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import type { SeasonRow } from "./season-shared";

/**
 * The offseason between two seasons. The calculation is the engine's
 * (packages/game-engine, offseason); this service loads the league, runs it
 * with an RNG seeded from the league and year, and stores the result in one
 * transaction (docs/ARCHITECTURE.md, "Offseason").
 */

const PAGE = 1000;

/** Database column for each rating. */
const RATING_COLUMNS: Record<keyof Ratings, string> = {
  inside: "inside",
  midRange: "mid_range",
  threePoint: "three_point",
  freeThrow: "free_throw",
  passing: "passing",
  ballHandling: "ball_handling",
  offRebound: "off_rebound",
  defRebound: "def_rebound",
  perimeterD: "perimeter_d",
  interiorD: "interior_d",
  speed: "speed",
  strength: "strength",
  stamina: "stamina",
};

const PLAYER_SELECT = [
  "id",
  "team_id",
  "first_name",
  "last_name",
  "position",
  "age",
  "jersey",
  "overall",
  "potential",
  ...Object.values(RATING_COLUMNS),
].join(", ");

type Row = Record<string, string | number | null>;

/** Every row of a query, a page at a time (PostgREST returns at most 1000). */
async function allRows(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/**
 * Runs the offseason after an archived season, once. A season whose
 * offseason has already been applied (a retry after a failure) does nothing.
 */
export async function runSeasonOffseason(
  ctx: UserContext,
  leagueId: string,
  season: SeasonRow,
  standingsOrder: readonly string[],
): Promise<void> {
  if (season.offseason_done_at) return;

  const [active, names, series] = await Promise.all([
    allRows((from, to) =>
      ctx.supabase
        .from("players")
        .select(PLAYER_SELECT)
        .eq("league_id", leagueId)
        .eq("status", "active")
        .order("id")
        .range(from, to),
    ),
    allRows((from, to) =>
      ctx.supabase
        .from("players")
        .select("first_name, last_name")
        .eq("league_id", leagueId)
        .order("id")
        .range(from, to),
    ),
    ctx.supabase
      .from("playoff_series")
      .select("round, team_a, team_b, winner_team_id")
      .eq("season_id", season.id),
  ]);
  if (series.error) throw series.error;
  // How far each playoff team got: the rounds it played, plus one for the title.
  const lastRound = Math.max(0, ...series.data.map((s) => s.round));
  const playoffDepth = new Map<string, number>();
  for (const s of series.data) {
    for (const team of [s.team_a, s.team_b]) {
      const won = s.round === lastRound && s.winner_team_id === team ? 1 : 0;
      playoffDepth.set(
        team,
        Math.max(playoffDepth.get(team) ?? 0, s.round + won),
      );
    }
  }

  const players: EnginePlayer[] = active.map((row) => {
    const ratings = {} as Ratings;
    for (const key of RATING_KEYS) {
      ratings[key] = Number(row[RATING_COLUMNS[key]]);
    }
    return {
      id: String(row.id),
      teamId: row.team_id ? String(row.team_id) : null,
      firstName: String(row.first_name),
      lastName: String(row.last_name),
      position: row.position as Position,
      age: Number(row.age),
      jersey: Number(row.jersey),
      ratings,
      overall: Number(row.overall),
      potential: Number(row.potential),
    };
  });

  const rng = createRng(seedState(`${leagueId}:offseason:${season.year}`));
  const { players: result, lottery } = runOffseason(rng, {
    standingsOrder,
    playoffDepth,
    players,
    takenNames: new Set(names.map((n) => `${n.first_name} ${n.last_name}`)),
  });

  await applyOffseason({
    seasonId: season.id,
    lottery: lottery.map((l) => ({
      team_id: l.teamId,
      finish_rank: l.finishRank,
      expected_pick: l.expectedPick,
      odds: l.odds,
    })),
    changes: result.map((p) => {
      const ratings: Record<string, number> = {};
      for (const key of RATING_KEYS) {
        ratings[RATING_COLUMNS[key]] = p.ratings[key];
      }
      return {
        id: p.id ?? crypto.randomUUID(),
        is_new: p.id === null,
        first_name: p.firstName,
        last_name: p.lastName,
        position: p.position,
        age: p.age,
        height_inches: p.heightInches,
        weight_pounds: p.weightPounds,
        jersey: p.jersey,
        overall: p.overall,
        potential: p.potential,
        previous_overall: p.previousOverall,
        ...ratings,
        team_id: p.teamId,
        retired: p.retired,
        draft_round: p.draft?.round ?? null,
        draft_pick: p.draft?.pick ?? null,
        draft_team_id: p.draft?.teamId ?? null,
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

const REPORT_COLUMNS =
  "id, first_name, last_name, position, age, overall, potential, team_id";

/** What the league's latest offseason did. */
export async function getOffseason(
  ctx: UserContext,
  leagueId: string,
): Promise<OffseasonResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueId));
  const latest = await ctx.supabase
    .from("draft_picks")
    .select("season_year")
    .eq("league_id", league.id)
    .order("season_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw latest.error;
  const year = latest.data?.season_year ?? null;
  if (year === null) {
    return { year, draft: [], retired: [], risers: [], fallers: [] };
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
    found.data.map((p) => [p.id, p as ReportRow]),
  );
  const mover = (m: { id: string; change: number }) => {
    const row = byId.get(m.id);
    return row ? [{ ...view(row), change: m.change }] : [];
  };

  return {
    year,
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
