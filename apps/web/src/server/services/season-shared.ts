import "server-only";
import type { Database } from "@fullcourt/api-client";
import { seasonDate } from "@fullcourt/game-rules";
import type { OffseasonStage } from "@fullcourt/game-types";
import type { Season } from "@fullcourt/validation";
import type { UserContext } from "@/server/auth/session";

/** Reads of the current season, shared by the simulation, season and playoff services. */

export type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];

export function toSeason(
  row: SeasonRow,
  championTeamId: string | null = null,
): Season {
  return {
    id: row.id,
    year: row.year,
    phase: row.phase as Season["phase"],
    stage: (row.stage as OffseasonStage | null) ?? null,
    date: seasonDate({
      year: row.year,
      phase: row.phase as Season["phase"],
      stage: (row.stage as OffseasonStage | null) ?? null,
      day: row.day,
      lastDay: row.last_day,
    }),
    day: row.day,
    lastDay: row.last_day,
    schedulePreset: row.schedule_preset as Season["schedulePreset"],
    championTeamId,
  };
}

/** The league's most recent season, or null before the first. */
export async function latestSeason(
  ctx: UserContext,
  leagueId: string,
): Promise<SeasonRow | null> {
  const { data, error } = await ctx.supabase
    .from("seasons")
    .select("*")
    .eq("league_id", leagueId)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The team that won a finished season's playoffs, if it has been decided. */
export async function championOf(
  ctx: UserContext,
  seasonId: string,
): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from("season_awards")
    .select("team_id")
    .eq("season_id", seasonId)
    .eq("award", "champion")
    .maybeSingle();
  if (error) throw error;
  return data?.team_id ?? null;
}

/** A season as the API returns it, with its champion once there is one. */
export async function seasonView(
  ctx: UserContext,
  row: SeasonRow,
): Promise<Season> {
  const champion =
    row.phase === "complete" || row.archived_at
      ? await championOf(ctx, row.id)
      : null;
  return toSeason(row, champion);
}
