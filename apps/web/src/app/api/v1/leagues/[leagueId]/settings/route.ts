import { LeagueSettingsSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getSettings } from "@/server/services/leagues";

/** GET /api/v1/leagues/:leagueId/settings: the rules the league was created with. */
export const GET = apiRoute({
  response: LeagueSettingsSchema,
  handler: async ({ request, params }) =>
    getSettings(await authenticate(request), String(params.leagueId ?? "")),
});
