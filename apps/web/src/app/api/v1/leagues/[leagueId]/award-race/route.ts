import { AwardRaceResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getAwardRace } from "@/server/services/award-race";

/** GET /api/v1/leagues/:leagueId/award-race: who leads each award on the season so far. */
export const GET = apiRoute({
  response: AwardRaceResponseSchema,
  handler: async ({ request, params }) =>
    getAwardRace(await authenticate(request), String(params.leagueId ?? "")),
});
