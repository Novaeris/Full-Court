import { NewsResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getNews } from "@/server/services/news";

/** GET /api/v1/leagues/:leagueId/news: what has happened around the league, newest first. */
export const GET = apiRoute({
  response: NewsResponseSchema,
  handler: async ({ request, params }) =>
    getNews(await authenticate(request), String(params.leagueId ?? "")),
});
