import { gunzipSync } from "node:zlib";
import { LeagueExportSchema, LeagueSchema } from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { ApiError, apiRoute } from "@/server/api/handler";
import { importLeague } from "@/server/services/leagues";

/** The most a backup may be once unpacked. */
const MOST_BYTES = 64 * 1024 * 1024;

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
    let text: string;
    try {
      const bytes = Buffer.from(await request.arrayBuffer());
      const packed = request.headers.get("content-type") === "application/gzip";
      text = (
        packed ? gunzipSync(bytes, { maxOutputLength: MOST_BYTES }) : bytes
      ).toString("utf8");
      if (text.length > MOST_BYTES) throw new Error("too big");
    } catch {
      throw new ApiError(
        400,
        "invalid_backup",
        "That file couldn't be read as a backup.",
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(
        400,
        "invalid_backup",
        "That file isn't a league backup.",
      );
    }
    const backup = LeagueExportSchema.safeParse(json);
    if (!backup.success) {
      throw new ApiError(
        422,
        "invalid_backup",
        "That file isn't a backup this version can restore.",
      );
    }
    return importLeague(ctx, backup.data);
  },
});
