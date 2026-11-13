import {
  DraftPickRequestSchema,
  DraftResponseSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { pickProspect } from "@/server/services/draft";

/** POST /api/v1/leagues/:leagueId/draft/pick: make your team pick when it is on the clock. */
export const POST = apiRoute({
  body: DraftPickRequestSchema,
  response: DraftResponseSchema,
  handler: async ({ request, params, body }) =>
    pickProspect(
      await authenticate(request),
      String(params.leagueId ?? ""),
      body,
    ),
});
