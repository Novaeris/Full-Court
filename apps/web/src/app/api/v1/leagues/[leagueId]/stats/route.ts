import { StatsResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getStats } from "@/server/services/stats";

/** GET /api/v1/leagues/:leagueId/stats?phase=playoffs: the league's leaders for the season being played. */
export const GET = apiRoute({
  response: StatsResponseSchema,
  handler: async ({ request, params }) =>
    getStats(
      await authenticate(request),
      String(params.leagueId ?? ""),
      new URL(request.url).searchParams.get("phase") === "playoffs",
    ),
});
