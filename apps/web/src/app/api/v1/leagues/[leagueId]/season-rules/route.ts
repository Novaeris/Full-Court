import {
  LeagueSettingsSchema,
  SeasonRulesRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { setSeasonRules } from "@/server/services/season-rules";

/** PUT /api/v1/leagues/:leagueId/season-rules: the schedule and playoff format for the next season. */
export const PUT = apiRoute({
  body: SeasonRulesRequestSchema,
  response: LeagueSettingsSchema,
  handler: async ({ request, params, body }) =>
    setSeasonRules(
      await authenticate(request),
      String(params.leagueId ?? ""),
      body,
    ),
});
