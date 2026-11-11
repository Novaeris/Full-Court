import "server-only";
import { randomUUID } from "node:crypto";
import type { Database } from "@fullcourt/api-client";
import { generateWorld } from "@fullcourt/game-engine";
import {
  LEAGUE_LIMIT,
  LeagueIdSchema,
  type CreateLeagueInput,
  type League,
  type LeagueList,
  type RenameLeagueRequest,
} from "@fullcourt/validation";
import { insertLeagueWithWorld } from "@/server/admin/league-world";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";

/**
 * League (save slot) use-cases, shared by Server Actions and /api/v1/leagues.
 * Queries run as the caller under RLS, so another user's league simply
 * doesn't exist from here: it reports "not found", never "forbidden".
 */

type LeagueRow = Database["public"]["Tables"]["leagues"]["Row"];

const COLUMNS =
  "id, name, status, size, user_team_id, created_at, updated_at" as const;

function toLeague(
  row: Pick<
    LeagueRow,
    | "id"
    | "name"
    | "status"
    | "size"
    | "user_team_id"
    | "created_at"
    | "updated_at"
  >,
): League {
  return {
    id: row.id,
    name: row.name,
    status: row.status as League["status"],
    size: row.size as League["size"],
    userTeamId: row.user_team_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const notFound = () =>
  new ApiError(404, "league_not_found", "That league doesn't exist.");

/** Rejects malformed ids before they reach the database. */
export function parseLeagueId(id: string): string {
  const parsed = LeagueIdSchema.safeParse(id);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

export async function listLeagues(ctx: UserContext): Promise<LeagueList> {
  const { data, error } = await ctx.supabase
    .from("leagues")
    .select(COLUMNS)
    .eq("owner_id", ctx.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return { leagues: data.map(toLeague), limit: LEAGUE_LIMIT };
}

export async function getLeague(ctx: UserContext, id: string): Promise<League> {
  const { data, error } = await ctx.supabase
    .from("leagues")
    .select(COLUMNS)
    .eq("id", parseLeagueId(id))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return toLeague(data);
}

/**
 * Creates a league for the signed-in user with a freshly generated world.
 * The world is generated here on the server from a random seed and written
 * with the admin client, so no client can supply its own roster.
 */
export async function createLeague(
  ctx: UserContext,
  input: CreateLeagueInput,
): Promise<League> {
  const seed = randomUUID();
  const world = generateWorld({ seed, size: input.size });
  try {
    const row = await insertLeagueWithWorld({
      ownerId: ctx.user.id,
      name: input.name,
      size: input.size,
      seed,
      world,
    });
    return toLeague(row);
  } catch (error) {
    if (
      error instanceof Object &&
      "message" in error &&
      error.message === "league_limit_reached"
    ) {
      throw new ApiError(
        409,
        "league_limit_reached",
        `You can keep up to ${LEAGUE_LIMIT} leagues. Delete one to make room.`,
      );
    }
    throw error;
  }
}

export async function renameLeague(
  ctx: UserContext,
  id: string,
  input: RenameLeagueRequest,
): Promise<League> {
  const { data, error } = await ctx.supabase
    .from("leagues")
    .update({ name: input.name })
    .eq("id", parseLeagueId(id))
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return toLeague(data);
}

export async function deleteLeague(
  ctx: UserContext,
  id: string,
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("leagues")
    .delete()
    .eq("id", parseLeagueId(id))
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw notFound();
}
