import "server-only";
import type { Database } from "@fullcourt/api-client";
import type {
  Game,
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
