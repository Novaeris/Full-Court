import { LeagueSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { readBackup } from "@/server/api/backup-body";
import { apiRoute } from "@/server/api/handler";
import { replaceLeague } from "@/server/services/leagues";

/**
 * POST /api/v1/leagues/:leagueId/restore: restores a backup file over a league.
 * The league is replaced by the backup (a league with new ids, but the old
 * league's name), and only if the backup can be restored. The body is as for
 * /leagues/import.
 */
export const POST = apiRoute({
  response: LeagueSchema,
  status: 201,
  handler: async ({ request, params }) => {
    const ctx = await authenticate(request);
    return replaceLeague(
      ctx,
      String(params.leagueId ?? ""),
      await readBackup(request),
    );
  },
});
