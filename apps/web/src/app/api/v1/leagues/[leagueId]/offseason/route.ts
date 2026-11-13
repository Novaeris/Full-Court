import { OffseasonResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getOffseason } from "@/server/services/offseason";

/** GET /api/v1/leagues/:leagueId/offseason: what the latest offseason did. */
export const GET = apiRoute({
  response: OffseasonResponseSchema,
  handler: async ({ request, params }) =>
    getOffseason(await authenticate(request), String(params.leagueId ?? "")),
});
