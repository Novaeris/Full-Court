import { TeamDetailSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getTeam } from "@/server/services/world";

/** GET /api/v1/leagues/:leagueId/teams/:teamId: a team and its roster. */
export const GET = apiRoute({
  response: TeamDetailSchema,
  handler: async ({ request, params }) =>
    getTeam(
      await authenticate(request),
      String(params.leagueId ?? ""),
      String(params.teamId ?? ""),
    ),
});
