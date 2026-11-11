import { TeamListSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { listTeams } from "@/server/services/world";

/** GET /api/v1/leagues/:leagueId/teams */
export const GET = apiRoute({
  response: TeamListSchema,
  handler: async ({ request, params }) => ({
    teams: await listTeams(
      await authenticate(request),
      String(params.leagueId ?? ""),
    ),
  }),
});
