import {
  HireStaffRequestSchema,
  ReleaseStaffRequestSchema,
  StaffResponseSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getStaff, hireStaff, releaseStaff } from "@/server/services/staff";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** GET /api/v1/leagues/:leagueId/staff?team=: your team's staff, the market and the budget. */
export const GET = apiRoute({
  response: StaffResponseSchema,
  handler: async ({ request, params }) =>
    getStaff(
      await authenticate(request),
      leagueId(params),
      new URL(request.url).searchParams.get("team") ?? undefined,
    ),
});

/** POST /api/v1/leagues/:leagueId/staff: hire a free agent into his role. */
export const POST = apiRoute({
  body: HireStaffRequestSchema,
  response: StaffResponseSchema,
  handler: async ({ request, params, body }) =>
    hireStaff(await authenticate(request), leagueId(params), body),
});

/** DELETE /api/v1/leagues/:leagueId/staff: let one of your staff go. */
export const DELETE = apiRoute({
  body: ReleaseStaffRequestSchema,
  response: StaffResponseSchema,
  handler: async ({ request, params, body }) =>
    releaseStaff(await authenticate(request), leagueId(params), body),
});
