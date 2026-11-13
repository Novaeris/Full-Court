import { SeasonSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { startNextSeason } from "@/server/services/playoffs";

/**
 * POST /api/v1/leagues/:leagueId/next-season: from a complete season, archive
 * it into history and start the next one.
 */
export const POST = apiRoute({
  response: SeasonSchema,
  handler: async ({ request, params }) =>
    startNextSeason(await authenticate(request), String(params.leagueId ?? "")),
});
