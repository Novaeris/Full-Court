import {
  AnalyticsEventRequestSchema,
  AnalyticsEventResponseSchema,
} from "@fullcourt/validation";
import { after } from "next/server";
import { incrementEvent } from "@/server/admin/analytics";
import { apiRoute } from "@/server/api/handler";
import { routePattern } from "@/server/analytics/routes";
import { optedOut } from "@/server/analytics/track";

/**
 * POST /api/v1/events: count a page view or the start of a sign-up.
 * Anonymous by design: no cookies are read and nothing about the sender is
 * stored, only today's total for the event and route pattern.
 */
export const POST = apiRoute({
  body: AnalyticsEventRequestSchema,
  response: AnalyticsEventResponseSchema,
  handler: ({ request, body }) => {
    if (optedOut(request.headers)) return { recorded: false };
    const path =
      body.event === "page_view" ? routePattern(body.path ?? "/") : "";
    after(() => incrementEvent(body.event, path));
    return { recorded: true };
  },
});
