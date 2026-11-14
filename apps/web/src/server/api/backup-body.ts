import "server-only";
import { gunzipSync } from "node:zlib";
import { LeagueExportSchema, type LeagueExport } from "@fullcourt/validation";
import { ApiError } from "./handler";

/** The most a backup may be once unpacked. */
const MOST_BYTES = 64 * 1024 * 1024;

/**
 * Reads a league backup from a request: the JSON the export wrote, either as
 * it is or gzipped (content-type application/gzip, which is how the site sends
 * it), checked against the backup layout this version restores.
 */
export async function readBackup(request: Request): Promise<LeagueExport> {
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
  return backup.data;
}
