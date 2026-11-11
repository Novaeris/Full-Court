import { HealthResponseSchema } from "@fullcourt/validation";
import { apiRoute } from "@/server/api/handler";
import { buildVersion } from "@/server/health";

/** GET /api/v1/health: the versioned API's liveness check, used by api-client. */
export const GET = apiRoute({
  response: HealthResponseSchema,
  handler: () => ({ status: "ok" as const, version: buildVersion() }),
});
