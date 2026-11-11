import {
  CreateLeagueRequestSchema,
  LeagueListSchema,
  LeagueSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { trackEvent } from "@/server/analytics/track";
import { createLeague, listLeagues } from "@/server/services/leagues";

/** GET /api/v1/leagues: the caller's leagues, newest first. */
export const GET = apiRoute({
  response: LeagueListSchema,
  handler: async ({ request }) => listLeagues(await authenticate(request)),
});

/** POST /api/v1/leagues: create a league (409 league_limit_reached at the limit). */
export const POST = apiRoute({
  body: CreateLeagueRequestSchema,
  response: LeagueSchema,
  status: 201,
  handler: async ({ request, body }) => {
    const league = await createLeague(await authenticate(request), body);
    await trackEvent("league_created");
    return league;
  },
});
