import "server-only";
import type { Database } from "@fullcourt/api-client";
import {
  LEAGUE_LIMIT,
  LeagueIdSchema,
  type CreateLeagueRequest,
  type League,
  type LeagueList,
  type RenameLeagueRequest,
} from "@fullcourt/validation";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";

/**
 * League (save slot) use-cases, shared by Server Actions and /api/v1/leagues.
 * Queries run as the caller under RLS, so another user's league simply
 * doesn't exist from here: it reports "not found", never "forbidden".
 */

type LeagueRow = Database["public"]["Tables"]["leagues"]["Row"];

const COLUMNS = "id, name, status, created_at, updated_at";

function toLeague(
  row: Pick<LeagueRow, "id" | "name" | "status" | "created_at" | "updated_at">,
): League {
  return {
    id: row.id,
    name: row.name,
    status: row.status as League["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const notFound = () =>
  new ApiError(404, "league_not_found", "That league doesn't exist.");

/** Rejects malformed ids before they reach the database. */
function parseId(id: string): string {
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
    .eq("id", parseId(id))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return toLeague(data);
}

export async function createLeague(
  ctx: UserContext,
  input: CreateLeagueRequest,
): Promise<League> {
  const { data, error } = await ctx.supabase.rpc("create_league", {
    league_name: input.name,
  });
  if (error) {
    if (error.message === "league_limit_reached") {
      throw new ApiError(
        409,
        "league_limit_reached",
        `You can keep up to ${LEAGUE_LIMIT} leagues. Delete one to make room.`,
      );
    }
    throw error;
  }
  return toLeague(data);
}

export async function renameLeague(
  ctx: UserContext,
  id: string,
  input: RenameLeagueRequest,
): Promise<League> {
  const { data, error } = await ctx.supabase
    .from("leagues")
    .update({ name: input.name })
    .eq("id", parseId(id))
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
    .eq("id", parseId(id))
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw notFound();
}
