import { ChooseTeamRequestSchema, LeagueSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { chooseTeam } from "@/server/services/world";

/** POST /api/v1/leagues/:leagueId/team: choose the team you run (once). */
export const POST = apiRoute({
  body: ChooseTeamRequestSchema,
  response: LeagueSchema,
  handler: async ({ request, params, body }) =>
    chooseTeam(
      await authenticate(request),
      String(params.leagueId ?? ""),
      body,
    ),
});
