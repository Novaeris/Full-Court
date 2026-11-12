import {
  LeagueStructureSchema,
  RenameStructureRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { getStructure, renameStructure } from "@/server/services/world";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** GET /api/v1/leagues/:leagueId/structure: conferences and divisions with ids and names. */
export const GET = apiRoute({
  response: LeagueStructureSchema,
  handler: async ({ request, params }) =>
    getStructure(await authenticate(request), leagueId(params)),
});

/** PATCH /api/v1/leagues/:leagueId/structure: rename conferences and divisions. */
export const PATCH = apiRoute({
  body: RenameStructureRequestSchema,
  response: LeagueStructureSchema,
  handler: async ({ request, params, body }) =>
    renameStructure(await authenticate(request), leagueId(params), body),
});
