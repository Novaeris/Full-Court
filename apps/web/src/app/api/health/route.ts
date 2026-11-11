import { connection } from "next/server";
import { healthResponse } from "@/server/health";

/** Render's health check. Always answered at request time, never prerendered. */
export async function GET() {
  await connection();
  return Response.json(healthResponse(), {
    headers: { "cache-control": "no-store" },
  });
}
