import { ScheduleResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { listSchedule } from "@/server/services/season";

/**
 * GET /api/v1/leagues/:leagueId/schedule
 * `?team=<id>` is one team's whole season, `?day=<n>` one day; with neither,
 * the season's current day.
 */
export const GET = apiRoute({
  response: ScheduleResponseSchema,
  handler: async ({ request, params }) => {
    const query = new URL(request.url).searchParams;
    const day = query.get("day");
    return listSchedule(
      await authenticate(request),
      String(params.leagueId ?? ""),
      {
        team: query.get("team") ?? undefined,
        day: day === null ? undefined : Number(day),
      },
    );
  },
});
