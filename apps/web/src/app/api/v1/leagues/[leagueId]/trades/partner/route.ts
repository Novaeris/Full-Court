import { TradePartnerResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { ApiError, apiRoute } from "@/server/api/handler";
import { getTradePartner } from "@/server/services/trades";

/** GET /api/v1/leagues/:leagueId/trades/partner?partner=: a computer team's roster with contracts. */
export const GET = apiRoute({
  response: TradePartnerResponseSchema,
  handler: async ({ request, params }) => {
    const partner = new URL(request.url).searchParams.get("partner");
    if (!partner) {
      throw new ApiError(
        400,
        "invalid_request",
        "Say which team with ?partner=.",
      );
    }
    return getTradePartner(
      await authenticate(request),
      String(params.leagueId ?? ""),
      partner,
    );
  },
});
