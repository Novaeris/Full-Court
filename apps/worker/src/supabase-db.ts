import type { Database } from "@fullcourt/api-client";
import type { AiTrade } from "@fullcourt/game-engine";
import { pickValue, teamWorstness } from "@fullcourt/game-rules";
import { createClient } from "@supabase/supabase-js";
import type { WorkerConfig } from "./config";
import { describeError } from "./errors";
import type { StoredOffer, TradeTeam } from "./trade-round";
import type { StoredInjury } from "./db";
import {
  CommitRefused,
  CommitRejected,
  type DayCommit,
  type DayRows,
  type SeasonRow,
  type SimJobRow,
  type WorkerDb,
} from "./db";

const PLAYER_COLUMNS =
  "id, team_id, position, overall, inside, mid_range, three_point, free_throw, passing, ball_handling, off_rebound, def_rebound, perimeter_d, interior_d, speed, strength, stamina, injury_days";

/** The worker's database access: the service role, calling the admin_* functions. */
export function createSupabaseDb(config: WorkerConfig): WorkerDb {
  const client = createClient<Database>(config.supabaseUrl, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  /**
   * Every active player with a team, grouped: computer teams, owner teams
   * that haven't given trades to AI Assist, and `acting` (the computer teams
   * plus owner teams that have).
   */
  async function loadRosters(seasonId: string) {
    const season = await client
      .from("seasons")
      .select("league_id, year")
      .eq("id", seasonId)
      .single();
    if (season.error) throw season.error;
    const leagueId = season.data.league_id;
    // Picks are a bonus: a league without them yet (or a database that has
    // not had the picks migration) still trades players.
    await client.rpc("admin_ensure_pick_rights", { target_season: seasonId });
    const [teams, players, rights] = await Promise.all([
      client
        .from("teams")
        .select("id, local_player_slot, ai_trades")
        .eq("league_id", leagueId),
      client
        .from("players")
        .select(
          "id, team_id, position, age, overall, potential, salary, contract_expires",
        )
        .eq("league_id", leagueId)
        .eq("status", "active")
        .not("team_id", "is", null)
        .limit(5000),
      client
        .from("pick_rights")
        .select("id, season_year, round, original_team_id, team_id")
        .eq("league_id", leagueId)
        .gt("season_year", season.data.year),
    ]);
    if (teams.error) throw teams.error;
    if (players.error) throw players.error;
    const byTeam = new Map<string, TradeTeam>(
      teams.data.map((t) => [
        t.id,
        { id: t.id, payroll: 0, roster: [], picks: [] },
      ]),
    );
    for (const p of players.data) {
      const team = p.team_id ? byTeam.get(p.team_id) : undefined;
      if (!team) continue;
      const salary = p.salary ?? 0;
      team.payroll += salary;
      team.roster.push({
        id: p.id,
        position: p.position,
        age: p.age,
        overall: p.overall,
        potential: p.potential,
        salary,
        yearsLeft: Math.max(
          1,
          (p.contract_expires ?? season.data.year) - season.data.year + 1,
        ),
      });
    }
    // A pick is worth more the weaker its original team is.
    const worst = teamWorstness(
      [...byTeam.values()].map((t) => ({
        id: t.id,
        overalls: t.roster.map((p) => p.overall),
      })),
    );
    for (const r of rights.error ? [] : rights.data) {
      byTeam.get(r.team_id)?.picks?.push({
        id: r.id,
        value: pickValue({
          round: r.round,
          yearsAway: r.season_year - season.data.year,
          worstness: worst.get(r.original_team_id) ?? 0.5,
        }),
      });
    }
    const sorted = (list: TradeTeam[]) =>
      list.sort((a, b) => a.id.localeCompare(b.id));
    const pick = (
      keep: (t: NonNullable<typeof teams.data>[number]) => boolean,
    ) =>
      sorted(
        teams.data.flatMap((t) =>
          keep(t) ? [byTeam.get(t.id) as TradeTeam] : [],
        ),
      );
    return {
      computer: pick((t) => t.local_player_slot === null),
      owners: pick((t) => t.local_player_slot !== null && !t.ai_trades),
      acting: pick((t) => t.local_player_slot === null || t.ai_trades),
    };
  }

  return {
    async claimJob(worker: string): Promise<SimJobRow | null> {
      const { data, error } = await client.rpc("admin_claim_sim_job", {
        worker_name: worker,
      });
      if (error) throw error;
      return data[0] ?? null;
    },

    async requeueStale(maxAgeMs: number): Promise<number> {
      const { data, error } = await client.rpc("admin_requeue_stale_sim_jobs", {
        max_age: `${Math.round(maxAgeMs / 1000)} seconds`,
      });
      if (error) throw error;
      return data;
    },

    async loadSeason(id: string): Promise<SeasonRow> {
      const { data, error } = await client
        .from("seasons")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },

    async loadDay(season: SeasonRow, day: number): Promise<DayRows> {
      const [games, league] = await Promise.all([
        client
          .from("games")
          .select("*")
          .eq("season_id", season.id)
          .eq("day", day)
          .eq("status", "scheduled")
          .order("id"),
        client
          .from("leagues")
          .select("rng_state")
          .eq("id", season.league_id)
          .single(),
      ]);
      if (games.error) throw games.error;
      if (league.error) throw league.error;

      const teamIds = [
        ...new Set(games.data.flatMap((g) => [g.home_team_id, g.away_team_id])),
      ];
      if (teamIds.length === 0) {
        return { rngState: league.data.rng_state, games: [], players: [] };
      }
      const [players, coaches] = await Promise.all([
        client
          .from("players")
          .select(PLAYER_COLUMNS)
          .eq("league_id", season.league_id)
          .in("team_id", teamIds),
        client
          .from("teams")
          .select(
            "id, strategy_pace, strategy_three_point, strategy_defense, starters",
          )
          .eq("league_id", season.league_id)
          .in("id", teamIds),
      ]);
      if (players.error) throw players.error;
      if (coaches.error) throw coaches.error;
      return {
        rngState: league.data.rng_state,
        games: games.data,
        players: players.data,
        coaches: coaches.data,
      };
    },

    async commitDay(input: DayCommit): Promise<SimJobRow> {
      const { data, error } = await client.rpc("admin_commit_sim_day", {
        target_job: input.jobId,
        sim_day: input.day,
        new_rng_state: input.rngState,
        day_games: input.games,
        day_replays: input.replays as never,
        day_lines: input.lines as never,
      });
      if (error) {
        if (
          error.message === "job_not_running" ||
          error.message === "stale_day"
        ) {
          throw new CommitRefused(error.message);
        }
        const code = (error as { code?: string }).code ?? "";
        if (
          code.startsWith("22") ||
          code.startsWith("23") ||
          code === "P0001"
        ) {
          throw new CommitRejected(describeError(error));
        }
        throw error;
      }
      return data;
    },

    async loadTradeTeams(seasonId: string): Promise<TradeTeam[]> {
      const { acting } = await loadRosters(seasonId);
      return acting;
    },

    async loadOfferTeams(seasonId: string) {
      const { owners, computer } = await loadRosters(seasonId);
      return { owners, computer };
    },

    async applyTrade(seasonId: string, trade: AiTrade): Promise<void> {
      const { error } = await client.rpc("admin_apply_trade", {
        target_season: seasonId,
        trade_team_a: trade.teamA,
        trade_team_b: trade.teamB,
        from_a: trade.fromA,
        from_b: trade.fromB,
        picks_a: trade.picksA,
        picks_b: trade.picksB,
      });
      if (error) throw error;
    },

    async replaceOffers(
      seasonId: string,
      offers: StoredOffer[],
    ): Promise<void> {
      const { error } = await client.rpc("admin_replace_trade_offers", {
        target_season: seasonId,
        new_offers: offers as never,
      });
      if (error) throw error;
    },

    async applyInjuries(
      seasonId: string,
      day: number,
      injuries: StoredInjury[],
    ): Promise<void> {
      const { error } = await client.rpc("admin_apply_injuries", {
        target_season: seasonId,
        sim_day: day,
        new_injuries: injuries as never,
      });
      if (error) throw error;
    },

    async failJob(jobId: string, message: string): Promise<void> {
      const { error } = await client.rpc("admin_fail_sim_job", {
        target_job: jobId,
        message,
      });
      if (error) throw error;
    },
  };
}
