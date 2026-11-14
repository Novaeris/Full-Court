import "server-only";
import {
  STANDARD_SCHEDULE,
  samePlayoffs,
  sameSchedule,
  seasonRulesIssues,
} from "@fullcourt/game-rules";
import type { ScheduleRule } from "@fullcourt/game-types";
import {
  LeagueConfigSchema,
  type LeagueSettings,
  type SeasonRulesRequest,
} from "@fullcourt/validation";
import { storeLeagueConfig } from "@/server/admin/league-world";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, getSettings, parseLeagueId } from "./leagues";
import { getStructure } from "./world";

/**
 * Season rules (docs/DESIGN.md, "Season rules"): the schedule and the playoff
 * format. The owner sets them for the next season; the season being played
 * keeps the rules it began with, and they take over when the next season is
 * created (`promoteSeasonRules`).
 */

async function storedConfig(ctx: UserContext, leagueId: string) {
  const { data, error } = await ctx.supabase
    .from("leagues")
    .select("config")
    .eq("id", leagueId)
    .maybeSingle();
  if (error) throw error;
  return data?.config ? LeagueConfigSchema.parse(data.config) : null;
}

/** Sets the schedule and playoff format for the next season. */
export async function setSeasonRules(
  ctx: UserContext,
  leagueIdParam: string,
  input: SeasonRulesRequest,
): Promise<LeagueSettings> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const config = await storedConfig(ctx, league.id);
  if (!config) {
    throw new ApiError(
      409,
      "legacy_league",
      "This league was created before league rules could be chosen, so its rules are fixed.",
    );
  }
  const structure = await getStructure(ctx, league.id);
  const issues = seasonRulesIssues(structure, input.schedule, input.playoffs);
  if (issues.length > 0) {
    throw new ApiError(
      422,
      "invalid_rules",
      issues.map((i) => i.message).join(" "),
    );
  }

  // Rules equal to those in force are not "waiting": nothing changes.
  const same =
    sameSchedule(input.schedule, config.schedule ?? STANDARD_SCHEDULE) &&
    samePlayoffs(input.playoffs, config.playoffs);
  const { next: _old, ...rest } = config;
  await storeLeagueConfig(
    league.id,
    same
      ? rest
      : {
          ...rest,
          next: {
            ...(sameSchedule(
              input.schedule,
              config.schedule ?? STANDARD_SCHEDULE,
            )
              ? {}
              : { schedule: input.schedule }),
            ...(samePlayoffs(input.playoffs, config.playoffs)
              ? {}
              : { playoffs: input.playoffs }),
          },
        },
  );
  return getSettings(ctx, league.id);
}

/**
 * Called when a new season is created: rules waiting for it take over, and the
 * schedule to build it with is returned. Leagues with no stored rules use the
 * standard schedule and are never written to.
 */
export async function promoteSeasonRules(
  ctx: UserContext,
  leagueId: string,
): Promise<ScheduleRule> {
  const config = await storedConfig(ctx, leagueId);
  if (!config) return STANDARD_SCHEDULE;
  if (!config.next) return config.schedule ?? STANDARD_SCHEDULE;
  const { next, ...rest } = config;
  const promoted = {
    ...rest,
    playoffs: next.playoffs ?? config.playoffs,
    schedule: next.schedule ?? config.schedule ?? STANDARD_SCHEDULE,
  };
  await storeLeagueConfig(leagueId, promoted);
  return promoted.schedule;
}
