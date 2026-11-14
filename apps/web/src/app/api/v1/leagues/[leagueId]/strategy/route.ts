import {
  StrategyResponseSchema,
  UpdateStrategyRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getStrategy, updateStrategy } from "@/server/services/strategy";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** GET /api/v1/leagues/:leagueId/strategy?team=: how your team plays, and its roster. */
export const GET = apiRoute({
  response: StrategyResponseSchema,
  handler: async ({ request, params }) =>
    getStrategy(
      await authenticate(request),
      leagueId(params),
      new URL(request.url).searchParams.get("team") ?? undefined,
    ),
});

/** PATCH /api/v1/leagues/:leagueId/strategy: set the pace, three-point focus, defence and starters. */
export const PATCH = apiRoute({
  body: UpdateStrategyRequestSchema,
  response: StrategyResponseSchema,
  handler: async ({ request, params, body }) =>
    updateStrategy(await authenticate(request), leagueId(params), body),
});
