import { HealthResponseSchema } from "@fullcourt/validation";
import { apiRoute } from "@/server/api/handler";
import { buildVersion } from "@/server/health";

/** Render's health check. Always answered at request time, never prerendered. */
export const GET = apiRoute({
  response: HealthResponseSchema,
  handler: () => ({ status: "ok" as const, version: buildVersion() }),
});
