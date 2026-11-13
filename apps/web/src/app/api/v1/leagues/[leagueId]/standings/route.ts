import { StandingsResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getStandings } from "@/server/services/season";

/** GET /api/v1/leagues/:leagueId/standings: every team's record, best first. */
export const GET = apiRoute({
  response: StandingsResponseSchema,
  handler: async ({ request, params }) =>
    getStandings(await authenticate(request), String(params.leagueId ?? "")),
});
