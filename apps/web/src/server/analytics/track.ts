import "server-only";
import type { AnalyticsEvent } from "@fullcourt/validation";
import { headers } from "next/headers";
import { after } from "next/server";
import { incrementEvent } from "@/server/admin/analytics";

/** Global Privacy Control or Do Not Track: the visitor asked not to be counted. */
export function optedOut(requestHeaders: Headers): boolean {
  return (
    requestHeaders.get("sec-gpc") === "1" || requestHeaders.get("dnt") === "1"
  );
}

/**
 * Counts a server-side event (account created, league created…) after the
 * response is sent. Call it from Server Actions and route handlers.
 */
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  if (optedOut(await headers())) return;
  after(() => incrementEvent(event));
}
