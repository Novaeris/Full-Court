import { DraftResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { holdLotteryAction } from "@/server/services/draft";

/** POST /api/v1/leagues/:leagueId/draft/lottery: hold the lottery and set the draft order. */
export const POST = apiRoute({
  response: DraftResponseSchema,
  handler: async ({ request, params }) =>
    holdLotteryAction(
      await authenticate(request),
      String(params.leagueId ?? ""),
    ),
});
