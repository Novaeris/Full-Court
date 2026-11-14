import {
  ExtendRequestSchema,
  ExtendResultSchema,
  ExtensionsResponseSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { extendPlayer, getExtensions } from "@/server/services/extensions";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** GET /api/v1/leagues/:leagueId/extensions?team=: who on your team can be given a new contract. */
export const GET = apiRoute({
  response: ExtensionsResponseSchema,
  handler: async ({ request, params }) =>
    getExtensions(
      await authenticate(request),
      leagueId(params),
      new URL(request.url).searchParams.get("team") ?? undefined,
    ),
});

/** POST /api/v1/leagues/:leagueId/extensions: offer a new contract; he signs if it is worth enough to him. */
export const POST = apiRoute({
  body: ExtendRequestSchema,
  response: ExtendResultSchema,
  handler: async ({ request, params, body }) =>
    extendPlayer(await authenticate(request), leagueId(params), body),
});
