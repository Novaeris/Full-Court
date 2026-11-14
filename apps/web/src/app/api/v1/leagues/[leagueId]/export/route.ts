import { LeagueExportSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { exportLeague } from "@/server/services/export";

const run = apiRoute({
  response: LeagueExportSchema,
  handler: async ({ request, params }) =>
    exportLeague(await authenticate(request), String(params.leagueId ?? "")),
});

/** GET /api/v1/leagues/:leagueId/export: a backup of the league, as a JSON file to save. */
export const GET: typeof run = async (request, context) => {
  const response = await run(request, context);
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  headers.set(
    "content-disposition",
    'attachment; filename="full-court-league.json"',
  );
  return new Response(response.body, { status: 200, headers });
};
