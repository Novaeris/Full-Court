import {
  RosterMoveRequestSchema,
  RosterResponseSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import {
  getRoster,
  releaseFromRoster,
  signFreeAgent,
} from "@/server/services/roster";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** GET /api/v1/leagues/:leagueId/roster?team=: one of your rosters and the best free agents. */
export const GET = apiRoute({
  response: RosterResponseSchema,
  handler: async ({ request, params }) =>
    getRoster(
      await authenticate(request),
      leagueId(params),
      new URL(request.url).searchParams.get("team") ?? undefined,
    ),
});

/** POST /api/v1/leagues/:leagueId/roster: sign a free agent onto your roster. */
export const POST = apiRoute({
  body: RosterMoveRequestSchema,
  response: RosterResponseSchema,
  handler: async ({ request, params, body }) =>
    signFreeAgent(await authenticate(request), leagueId(params), body),
});

/** DELETE /api/v1/leagues/:leagueId/roster: release a player from your roster. */
export const DELETE = apiRoute({
  body: RosterMoveRequestSchema,
  response: RosterResponseSchema,
  handler: async ({ request, params, body }) =>
    releaseFromRoster(await authenticate(request), leagueId(params), body),
});
