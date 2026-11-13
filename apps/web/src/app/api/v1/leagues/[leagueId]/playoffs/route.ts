import { PlayoffsResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getPlayoffs } from "@/server/services/playoffs";

/** GET /api/v1/leagues/:leagueId/playoffs: the bracket, series by series. */
export const GET = apiRoute({
  response: PlayoffsResponseSchema,
  handler: async ({ request, params }) =>
    getPlayoffs(await authenticate(request), String(params.leagueId ?? "")),
});
