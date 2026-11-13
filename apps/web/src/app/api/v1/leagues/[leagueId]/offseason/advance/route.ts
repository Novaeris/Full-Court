import { SeasonSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { advanceOffseason } from "@/server/services/offseason";

/**
 * POST /api/v1/leagues/:leagueId/offseason/advance: take the current offseason
 * stage's step (the draft, free agency, training camp, the regular season's
 * opening) and move on to the next stage.
 */
export const POST = apiRoute({
  response: SeasonSchema,
  handler: async ({ request, params }) =>
    advanceOffseason(
      await authenticate(request),
      String(params.leagueId ?? ""),
    ),
});
