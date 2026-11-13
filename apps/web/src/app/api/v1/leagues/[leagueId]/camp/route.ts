import {
  CampResponseSchema,
  SetCampRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getCamp, setCamp } from "@/server/services/camp";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** GET /api/v1/leagues/:leagueId/camp?team=: who can go to training camp and who is going. */
export const GET = apiRoute({
  response: CampResponseSchema,
  handler: async ({ request, params }) =>
    getCamp(
      await authenticate(request),
      leagueId(params),
      new URL(request.url).searchParams.get("team") ?? undefined,
    ),
});

/** PUT /api/v1/leagues/:leagueId/camp: replace your team's camp roster. */
export const PUT = apiRoute({
  body: SetCampRequestSchema,
  response: CampResponseSchema,
  handler: async ({ request, params, body }) =>
    setCamp(await authenticate(request), leagueId(params), body),
});
