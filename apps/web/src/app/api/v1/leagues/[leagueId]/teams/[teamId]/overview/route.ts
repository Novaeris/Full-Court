import { TeamOverviewSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getTeamOverview } from "@/server/services/team-overview";

/** GET /api/v1/leagues/:leagueId/teams/:teamId/overview: how a team's season is going. */
export const GET = apiRoute({
  response: TeamOverviewSchema,
  handler: async ({ request, params }) =>
    getTeamOverview(
      await authenticate(request),
      String(params.leagueId ?? ""),
      String(params.teamId ?? ""),
    ),
});
