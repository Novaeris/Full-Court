import {
  DeleteLeagueResponseSchema,
  LeagueSchema,
  RenameLeagueRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import {
  deleteLeague,
  getLeague,
  renameLeague,
} from "@/server/services/leagues";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** GET /api/v1/leagues/:leagueId. Another user's league is a 404. */
export const GET = apiRoute({
  response: LeagueSchema,
  handler: async ({ request, params }) =>
    getLeague(await authenticate(request), leagueId(params)),
});

/** PATCH /api/v1/leagues/:leagueId: rename. */
export const PATCH = apiRoute({
  body: RenameLeagueRequestSchema,
  response: LeagueSchema,
  handler: async ({ request, params, body }) =>
    renameLeague(await authenticate(request), leagueId(params), body),
});

/** DELETE /api/v1/leagues/:leagueId: delete the league and everything in it. */
export const DELETE = apiRoute({
  response: DeleteLeagueResponseSchema,
  handler: async ({ request, params }) => {
    await deleteLeague(await authenticate(request), leagueId(params));
    return { deleted: true as const };
  },
});
