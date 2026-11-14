import { HallOfFameResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getHallOfFame } from "@/server/services/hall-of-fame";

/** GET /api/v1/leagues/:leagueId/hall-of-fame: the retired players inducted into the Hall of Fame. */
export const GET = apiRoute({
  response: HallOfFameResponseSchema,
  handler: async ({ request, params }) =>
    getHallOfFame(await authenticate(request), String(params.leagueId ?? "")),
});
