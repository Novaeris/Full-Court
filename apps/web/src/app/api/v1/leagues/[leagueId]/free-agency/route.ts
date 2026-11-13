import { FreeAgencyResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getFreeAgency } from "@/server/services/freeagency";

/** GET /api/v1/leagues/:leagueId/free-agency?team=: free agency's 21 days, the market and your offers. */
export const GET = apiRoute({
  response: FreeAgencyResponseSchema,
  handler: async ({ request, params }) =>
    getFreeAgency(
      await authenticate(request),
      String(params.leagueId ?? ""),
      new URL(request.url).searchParams.get("team") ?? undefined,
    ),
});
