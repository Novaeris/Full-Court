import {
  TradeEvaluationSchema,
  TradeProposalSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { evaluateTrade } from "@/server/services/trades";

/** POST /api/v1/leagues/:leagueId/trades/evaluate: whether a trade is legal and what the computer team would say. */
export const POST = apiRoute({
  body: TradeProposalSchema,
  response: TradeEvaluationSchema,
  handler: async ({ request, params, body }) =>
    evaluateTrade(
      await authenticate(request),
      String(params.leagueId ?? ""),
      body,
    ),
});
