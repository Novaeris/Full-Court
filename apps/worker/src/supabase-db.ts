import type { Database } from "@fullcourt/api-client";
import type { AiTrade } from "@fullcourt/game-engine";
import { createClient } from "@supabase/supabase-js";
import type { WorkerConfig } from "./config";
import { describeError } from "./errors";
import type { TradeTeam } from "./trade-round";
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
  "id, team_id, position, overall, inside, mid_range, three_point, free_throw, passing, ball_handling, off_rebound, def_rebound, perimeter_d, interior_d, speed, strength, stamina";

/** The worker's database access: the service role, calling the admin_* functions. */
export function createSupabaseDb(config: WorkerConfig): WorkerDb {
  const client = createClient<Database>(config.supabaseUrl, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

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
      const players = await client
        .from("players")
        .select(PLAYER_COLUMNS)
        .eq("league_id", season.league_id)
        .in("team_id", teamIds);
      if (players.error) throw players.error;
      return {
        rngState: league.data.rng_state,
        games: games.data,
        players: players.data,
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
      const season = await client
        .from("seasons")
        .select("league_id, year")
        .eq("id", seasonId)
        .single();
      if (season.error) throw season.error;
      const leagueId = season.data.league_id;
      const [teams, players] = await Promise.all([
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
      ]);
      if (teams.error) throw teams.error;
      if (players.error) throw players.error;
      const acting = new Set(
        teams.data
          .filter((t) => t.local_player_slot === null || t.ai_trades)
          .map((t) => t.id),
      );
      const byTeam = new Map<string, TradeTeam>();
      for (const p of players.data) {
        if (!p.team_id || !acting.has(p.team_id)) continue;
        const team = byTeam.get(p.team_id) ?? {
          id: p.team_id,
          payroll: 0,
          roster: [],
        };
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
        byTeam.set(p.team_id, team);
      }
      return [...byTeam.values()].sort((a, b) => a.id.localeCompare(b.id));
    },

    async applyTrade(seasonId: string, trade: AiTrade): Promise<void> {
      const { error } = await client.rpc("admin_apply_trade", {
        target_season: seasonId,
        trade_team_a: trade.teamA,
        trade_team_b: trade.teamB,
        from_a: trade.fromA,
        from_b: trade.fromB,
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
