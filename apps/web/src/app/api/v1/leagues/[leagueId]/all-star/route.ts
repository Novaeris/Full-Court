import { AllStarResponseSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getAllStar } from "@/server/services/allstar";

/** GET /api/v1/leagues/:leagueId/all-star?year=: a season's All-Star Game (the latest by default). */
export const GET = apiRoute({
  response: AllStarResponseSchema,
  handler: async ({ request, params }) => {
    const year = new URL(request.url).searchParams.get("year");
    return getAllStar(
      await authenticate(request),
      String(params.leagueId ?? ""),
      year && /^\d{4}$/.test(year) ? Number(year) : undefined,
    );
  },
});
