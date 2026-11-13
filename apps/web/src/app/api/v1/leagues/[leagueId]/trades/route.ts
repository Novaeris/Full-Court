import {
  TradeProposalSchema,
  TradeResultSchema,
  TradesResponseSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getTrades, proposeTrade } from "@/server/services/trades";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** GET /api/v1/leagues/:leagueId/trades?team=: whether trades are open, your roster, the teams to trade with and recent trades. */
export const GET = apiRoute({
  response: TradesResponseSchema,
  handler: async ({ request, params }) =>
    getTrades(
      await authenticate(request),
      leagueId(params),
      new URL(request.url).searchParams.get("team") ?? undefined,
    ),
});

/** POST /api/v1/leagues/:leagueId/trades: propose a trade; it is made if it is legal and the computer team accepts. */
export const POST = apiRoute({
  body: TradeProposalSchema,
  response: TradeResultSchema,
  handler: async ({ request, params, body }) =>
    proposeTrade(await authenticate(request), leagueId(params), body),
});
