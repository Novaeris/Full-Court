import { ShopRequestSchema, ShopResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { shopTradePlayers } from "@/server/services/trades";

/** POST /api/v1/leagues/:leagueId/trades/shop: what the computer teams would give for your players. */
export const POST = apiRoute({
  body: ShopRequestSchema,
  response: ShopResponseSchema,
  handler: async ({ request, params, body }) =>
    shopTradePlayers(
      await authenticate(request),
      String(params.leagueId ?? ""),
      body,
    ),
});
