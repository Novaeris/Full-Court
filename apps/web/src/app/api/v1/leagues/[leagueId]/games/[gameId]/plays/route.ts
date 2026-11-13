import { GamePlaysSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getGamePlays } from "@/server/services/season";

/** GET /api/v1/leagues/:leagueId/games/:gameId/plays: the game's plays, replayed by the server. */
export const GET = apiRoute({
  response: GamePlaysSchema,
  handler: async ({ request, params }) =>
    getGamePlays(
      await authenticate(request),
      String(params.leagueId ?? ""),
      String(params.gameId ?? ""),
    ),
});
