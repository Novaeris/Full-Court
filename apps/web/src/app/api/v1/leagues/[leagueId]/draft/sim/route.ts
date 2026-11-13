import {
  DraftResponseSchema,
  DraftSimRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { simDraft } from "@/server/services/draft";

/**
 * POST /api/v1/leagues/:leagueId/draft/sim: the computer teams pick until one
 * of yours is on the clock; with `autoMine`, your teams picks are made too.
 */
export const POST = apiRoute({
  body: DraftSimRequestSchema,
  response: DraftResponseSchema,
  handler: async ({ request, params, body }) =>
    simDraft(await authenticate(request), String(params.leagueId ?? ""), body),
});
