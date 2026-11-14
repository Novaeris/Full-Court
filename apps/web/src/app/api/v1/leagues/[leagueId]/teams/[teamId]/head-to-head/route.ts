import { HeadToHeadResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getHeadToHead } from "@/server/services/head-to-head";

/** GET /api/v1/leagues/:leagueId/teams/:teamId/head-to-head: a team's all-time record against each opponent. */
export const GET = apiRoute({
  response: HeadToHeadResponseSchema,
  handler: async ({ request, params }) =>
    getHeadToHead(
      await authenticate(request),
      String(params.leagueId ?? ""),
      String(params.teamId ?? ""),
    ),
});
