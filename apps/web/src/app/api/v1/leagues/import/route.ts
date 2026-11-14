import { LeagueSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { readBackup } from "@/server/api/backup-body";
import { apiRoute } from "@/server/api/handler";
import { importLeague } from "@/server/services/leagues";

/**
 * POST /api/v1/leagues/import: restores a backup file as a new league. The
 * body is the JSON the export wrote, either as it is or gzipped
 * (content-type application/gzip, which is how the site sends it).
 */
export const POST = apiRoute({
  response: LeagueSchema,
  status: 201,
  handler: async ({ request }) => {
    const ctx = await authenticate(request);
    return importLeague(ctx, await readBackup(request));
  },
});
