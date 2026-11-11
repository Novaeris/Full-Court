import { connection } from "next/server";
import { errorResponse } from "@/server/api/handler";

/** Unknown /api/v1 paths answer with the shared error envelope, not an HTML 404. */
async function notFound(): Promise<Response> {
  await connection();
  return errorResponse(404, "not_found", "No such API endpoint.");
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
