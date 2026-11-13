import "server-only";
import { createRng, generateSchedule, seedState } from "@fullcourt/game-engine";
import { validateScheduleTiers } from "@fullcourt/game-rules";
import { DEFAULT_SCHEDULE_TIERS } from "@fullcourt/game-types";
import { insertSeason } from "@/server/admin/season";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { latestSeason } from "./season-shared";
import { getStructure } from "./world";

/**
 * Creating a season: the schedule for the default preset, built from the
 * league's own structure. The schedule's RNG is seeded from the league id and
 * year, so it never disturbs the league's simulation RNG and the same league
 * and year always get the same schedule. The caller has already shown that
 * the user owns the league.
 */
export async function createSeason(
  ctx: UserContext,
  league: { id: string },
  year: number,
): Promise<void> {
  const tiers = DEFAULT_SCHEDULE_TIERS;
  const structure = await getStructure(ctx, league.id);
  const problems = validateScheduleTiers(structure, tiers);
  if (problems.length > 0) {
    throw new ApiError(
      422,
      "schedule_not_supported",
      "This league's structure can't be given an even schedule.",
    );
  }
  const { data: teams, error } = await ctx.supabase
    .from("teams")
    .select("id, conference_id, division_id")
    .eq("league_id", league.id);
  if (error) throw error;

  const games = generateSchedule(
    {
      structure,
      teams: teams.map((t) => ({
        teamId: t.id,
        conferenceId: t.conference_id,
        divisionId: t.division_id,
      })),
      tiers,
    },
    createRng(seedState(`${league.id}:schedule:${year}`)),
  );

  try {
    await insertSeason({
      leagueId: league.id,
      year,
      preset: "standard",
      tiers,
      games,
    });
  } catch (e) {
    // Two requests can race to create the same season: the loser is fine.
    if ((e as { code?: string }).code !== "23505") throw e;
  }
}

/** Creates the league's first season when it has none. */
export async function ensureSeason(
  ctx: UserContext,
  league: { id: string; createdAt: string },
): Promise<void> {
  if (await latestSeason(ctx, league.id)) return;
  await createSeason(ctx, league, new Date(league.createdAt).getUTCFullYear());
}
