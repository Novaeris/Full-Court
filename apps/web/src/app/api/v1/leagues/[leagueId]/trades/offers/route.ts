import { OfferAnswerSchema, TradesResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { answerTradeOffer } from "@/server/services/trades";

/** POST /api/v1/leagues/:leagueId/trades/offers: accept or decline an offer from a computer team. */
export const POST = apiRoute({
  body: OfferAnswerSchema,
  response: TradesResponseSchema,
  handler: async ({ request, params, body }) =>
    answerTradeOffer(
      await authenticate(request),
      String(params.leagueId ?? ""),
      body,
    ),
});
