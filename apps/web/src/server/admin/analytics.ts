import "server-only";
import type { AnalyticsEvent } from "@fullcourt/validation";
import { createAdminClient } from "./supabase";

/** Adds one to today's total for an event. Never throws: analytics must not break a request. */
export async function incrementEvent(
  event: AnalyticsEvent,
  path = "",
): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("admin_record_event", {
      event_name: event,
      event_path: path,
    });
    if (error) console.error("analytics:", error.message);
  } catch (error) {
    console.error("analytics:", error instanceof Error ? error.message : error);
  }
}
