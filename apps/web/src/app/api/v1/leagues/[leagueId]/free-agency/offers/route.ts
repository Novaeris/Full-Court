import {
  FreeAgencyResponseSchema,
  MakeOfferRequestSchema,
  WithdrawOfferRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { makeFaOffer, withdrawFaOffer } from "@/server/services/freeagency";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** POST /api/v1/leagues/:leagueId/free-agency/offers: make or change an offer to a free agent. */
export const POST = apiRoute({
  body: MakeOfferRequestSchema,
  response: FreeAgencyResponseSchema,
  handler: async ({ request, params, body }) =>
    makeFaOffer(await authenticate(request), leagueId(params), body),
});

/** DELETE /api/v1/leagues/:leagueId/free-agency/offers: withdraw an offer. */
export const DELETE = apiRoute({
  body: WithdrawOfferRequestSchema,
  response: FreeAgencyResponseSchema,
  handler: async ({ request, params, body }) =>
    withdrawFaOffer(await authenticate(request), leagueId(params), body),
});
