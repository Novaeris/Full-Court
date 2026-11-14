import {
  TradesResponseSchema,
  TradingBlockRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { setBlock } from "@/server/services/trades";

/** POST /api/v1/leagues/:leagueId/trades/block: put up to five of your players on the trading block. */
export const POST = apiRoute({
  body: TradingBlockRequestSchema,
  response: TradesResponseSchema,
  handler: async ({ request, params, body }) =>
    setBlock(await authenticate(request), String(params.leagueId ?? ""), body),
});
