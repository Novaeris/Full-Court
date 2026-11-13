import "server-only";
import type { Database } from "@fullcourt/api-client";
import type { BracketSeries } from "@fullcourt/game-rules";
import type {
  Game,
  PlayoffConfig,
  SchedulePreset,
  ScheduleTiers,
} from "@fullcourt/game-types";
import { createAdminClient } from "./supabase";

type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];

/**
 * Writes a season and its whole schedule in one transaction through
 * public.admin_create_season(), which only the service role may call. The
 * caller has already checked that the user owns the league; the database
 * still refuses an empty schedule or a team playing twice in a day.
 */
export async function insertSeason(input: {
  leagueId: string;
  year: number;
  preset: SchedulePreset;
  tiers: ScheduleTiers;
  games: readonly Game[];
}): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc("admin_create_season", {
    target_league: input.leagueId,
    season_year: input.year,
    preset: input.preset,
    tiers: { ...input.tiers },
    schedule: input.games.map((g) => ({
      day: g.day,
      home_team_id: g.homeTeamId,
      away_team_id: g.awayTeamId,
    })),
  });
  if (error) throw error;
  return data;
}

/**
 * Stores the playoff bracket (the league's rules and the first round, seeded
 * by the caller) and schedules its first games, through
 * public.admin_create_playoffs(), which only the service role may call.
 */
export async function insertPlayoffs(input: {
  seasonId: string;
  config: PlayoffConfig;
  firstRound: readonly BracketSeries[];
}): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc(
    "admin_create_playoffs",
    {
      target_season: input.seasonId,
      config: { ...input.config },
      series: input.firstRound.map((s) => ({
        slot: s.slot,
        best_of: s.bestOf,
        team_a: s.a.teamId,
        seed_a: s.a.seed,
        rank_a: s.a.rank,
        team_b: s.b.teamId,
        seed_b: s.b.seed,
        rank_b: s.b.rank,
      })),
    },
  );
  if (error) throw error;
  return data;
}

/**
 * Summarises a complete season into history and deletes its detail, through
 * public.admin_archive_season(). `standingsOrder` is every team, best first.
 */
export async function archiveSeason(input: {
  seasonId: string;
  standingsOrder: readonly string[];
}): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc(
    "admin_archive_season",
    {
      target_season: input.seasonId,
      standings_order: [...input.standingsOrder],
    },
  );
  if (error) throw error;
  return data;
}

/**
 * Stores one offseason (progression, retirements, the draft, roster moves) in
 * one transaction, through public.admin_apply_offseason().
 */
export async function applyOffseason(input: {
  seasonId: string;
  changes: readonly Record<string, unknown>[];
}): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc(
    "admin_apply_offseason",
    {
      target_season: input.seasonId,
      changes: input.changes as never,
    },
  );
  if (error) throw error;
  return data;
}
