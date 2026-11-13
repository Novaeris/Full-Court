import {
  FreeAgencyResponseSchema,
  SimFreeAgencyRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { simFreeAgency } from "@/server/services/freeagency";

/** POST /api/v1/leagues/:leagueId/free-agency/sim: simulate a day, a week, or the rest of free agency. */
export const POST = apiRoute({
  body: SimFreeAgencyRequestSchema,
  response: FreeAgencyResponseSchema,
  handler: async ({ request, params, body }) =>
    simFreeAgency(
      await authenticate(request),
      String(params.leagueId ?? ""),
      body,
    ),
});
