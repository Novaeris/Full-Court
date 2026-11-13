import { DraftResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getDraft } from "@/server/services/draft";

/** GET /api/v1/leagues/:leagueId/draft?team=: the draft as one of your teams sees it. */
export const GET = apiRoute({
  response: DraftResponseSchema,
  handler: async ({ request, params }) =>
    getDraft(
      await authenticate(request),
      String(params.leagueId ?? ""),
      new URL(request.url).searchParams.get("team") ?? undefined,
    ),
});
