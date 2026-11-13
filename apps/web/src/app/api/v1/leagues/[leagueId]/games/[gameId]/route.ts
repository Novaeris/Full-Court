import { GameDetailSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getGame } from "@/server/services/season";

/** GET /api/v1/leagues/:leagueId/games/:gameId: the game, its box score and its replay recipe. */
export const GET = apiRoute({
  response: GameDetailSchema,
  handler: async ({ request, params }) =>
    getGame(
      await authenticate(request),
      String(params.leagueId ?? ""),
      String(params.gameId ?? ""),
    ),
});
