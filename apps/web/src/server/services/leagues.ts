import "server-only";
import { randomUUID } from "node:crypto";
import type { Database } from "@fullcourt/api-client";
import { contrastRatio } from "@fullcourt/design-tokens";
import {
  findCity,
  generateOwnerWorld,
  generateWorld,
} from "@fullcourt/game-engine";
import {
  equalStructure,
  validateOwnerModeSetup,
  validateSupportedStructure,
} from "@fullcourt/game-rules";
import {
  LEAGUE_LIMIT,
  LeagueIdSchema,
  type CreateLeagueInput,
  type League,
  type LeagueList,
  type OwnerSetupInput,
  type RenameLeagueRequest,
} from "@fullcourt/validation";
import {
  insertLeagueWithWorld,
  insertOwnerLeagueWithWorld,
} from "@/server/admin/league-world";
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

const limitReached = () =>
  new ApiError(
    409,
    "league_limit_reached",
    `You can keep up to ${LEAGUE_LIMIT} leagues. Delete one to make room.`,
  );

function isLimitError(error: unknown): boolean {
  return (
    error instanceof Object &&
    "message" in error &&
    error.message === "league_limit_reached"
  );
}

const invalidSetup = (message: string) =>
  new ApiError(400, "invalid_setup", message);

/**
 * Creates a league for the signed-in user with a freshly generated world.
 * The world is generated here on the server from a random seed and written
 * with the admin client, so no client can supply its own roster. Requests
 * with `setup` create an Owner Mode league; without it, the original kind.
 */
export async function createLeague(
  ctx: UserContext,
  input: CreateLeagueInput,
): Promise<League> {
  if (input.setup) return createOwnerLeague(ctx, input.name, input.setup);

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
    if (isLimitError(error)) throw limitReached();
    throw error;
  }
}

/**
 * Owner Mode creation. Checks the request against the game rules, generates
 * the league (real cities in geographic divisions, a franchise identity for
 * every team, full rosters), checks the generated league against the rules
 * again, and writes it in one transaction.
 */
async function createOwnerLeague(
  ctx: UserContext,
  name: string,
  setup: OwnerSetupInput,
): Promise<League> {
  const { config, shape: sizes, franchises } = setup;
  const shape = equalStructure(
    sizes.conferences,
    sizes.divisionsPerConference,
    sizes.teamsPerDivision,
  );
  const structureIssue = validateSupportedStructure(shape)[0];
  if (structureIssue) throw invalidSetup(structureIssue.message);

  const cities = new Set<string>();
  for (const f of franchises) {
    if (findCity(f.cityId)?.region !== config.region) {
      throw invalidSetup("Choose cities from the region of play.");
    }
    if (cities.has(f.cityId)) {
      throw invalidSetup("Two franchises can't share a city.");
    }
    cities.add(f.cityId);
    if (f.primaryColor && contrastRatio(f.primaryColor, "#ffffff") < 4.5) {
      throw invalidSetup(
        "Choose a darker primary colour so names stay readable.",
      );
    }
  }

  const seed = randomUUID();
  let world: ReturnType<typeof generateOwnerWorld>;
  try {
    world = generateOwnerWorld({
      seed,
      identitySeed: setup.identitySeed,
      region: config.region,
      shape,
      localPlayers: setup.localPlayers,
      franchises,
    });
  } catch (error) {
    throw invalidSetup(
      error instanceof Error ? error.message : "That setup can't be generated.",
    );
  }

  const issue = validateOwnerModeSetup({
    config,
    structure: world.structure,
    localPlayers: world.localPlayers,
    franchises: world.teams
      .filter((t) => t.localPlayerSlot !== null)
      .map((t) => ({
        cityId: t.cityId,
        nickname: t.nickname,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        logoId: t.logoId,
        conferenceId: t.conferenceId,
        divisionId: t.divisionId,
        localPlayerSlot: t.localPlayerSlot,
        aiAssist: t.aiAssist,
      })),
  })[0];
  if (issue) throw invalidSetup(issue.message);

  try {
    const row = await insertOwnerLeagueWithWorld({
      ownerId: ctx.user.id,
      name,
      size: config.preset,
      config,
      seed,
      world,
    });
    return toLeague(row);
  } catch (error) {
    if (isLimitError(error)) throw limitReached();
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
