import { connection } from "next/server";
import { healthResponse } from "@/server/health";

/** GET /api/v1/health: the versioned API's liveness check, used by api-client. */
export async function GET() {
  await connection();
  return Response.json(healthResponse(), {
    headers: { "cache-control": "no-store" },
  });
}
