import { HistoryResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getHistory } from "@/server/services/history";

/** GET /api/v1/leagues/:leagueId/history: champions, awards, titles and records from the archived seasons. */
export const GET = apiRoute({
  response: HistoryResponseSchema,
  handler: async ({ request, params }) =>
    getHistory(await authenticate(request), String(params.leagueId ?? "")),
});
