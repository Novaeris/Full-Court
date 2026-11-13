import {
  AiAssistResponseSchema,
  UpdateAiAssistRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { updateAiAssist } from "@/server/services/roster";

/** PATCH /api/v1/leagues/:leagueId/ai-assist: switch AI Assist on or off for a franchise you run. */
export const PATCH = apiRoute({
  body: UpdateAiAssistRequestSchema,
  response: AiAssistResponseSchema,
  handler: async ({ request, params, body }) =>
    updateAiAssist(
      await authenticate(request),
      String(params.leagueId ?? ""),
      body,
    ),
});
