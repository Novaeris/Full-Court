import { InboxResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getInbox } from "@/server/services/inbox";

/** GET /api/v1/leagues/:leagueId/inbox?team=: what has happened to your team, newest first. */
export const GET = apiRoute({
  response: InboxResponseSchema,
  handler: async ({ request, params }) =>
    getInbox(
      await authenticate(request),
      String(params.leagueId ?? ""),
      new URL(request.url).searchParams.get("team") ?? undefined,
    ),
});
