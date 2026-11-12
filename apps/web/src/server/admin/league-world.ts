import "server-only";
import type { Database } from "@fullcourt/api-client";
import type {
  GeneratedOwnerWorld,
  GeneratedWorld,
} from "@fullcourt/game-engine";
import type {
  LeagueConfig,
  LeagueSize,
  PlayerSeed,
} from "@fullcourt/game-types";
import { createAdminClient } from "./supabase";

type LeagueRow = Database["public"]["Tables"]["leagues"]["Row"];

/** Players in the shape admin_create_league and admin_create_owner_league expect. */
function playerRows(seeds: readonly PlayerSeed[]) {
  return seeds.map((p) => ({
    team: p.team,
    first_name: p.firstName,
    last_name: p.lastName,
    position: p.position,
    age: p.age,
    height_inches: p.heightInches,
    weight_pounds: p.weightPounds,
    jersey: p.jersey,
    overall: p.overall,
    potential: p.potential,
    inside: p.ratings.inside,
    mid_range: p.ratings.midRange,
    three_point: p.ratings.threePoint,
    free_throw: p.ratings.freeThrow,
    passing: p.ratings.passing,
    ball_handling: p.ratings.ballHandling,
    off_rebound: p.ratings.offRebound,
    def_rebound: p.ratings.defRebound,
    perimeter_d: p.ratings.perimeterD,
    interior_d: p.ratings.interiorD,
    speed: p.ratings.speed,
    strength: p.ratings.strength,
    stamina: p.ratings.stamina,
  }));
}

/**
 * Writes a new league and its generated world in one transaction through
 * public.admin_create_league(), which only the service role may call. The
 * caller has already authenticated the owner; the database still enforces
 * the per-account league limit.
 */
export async function insertLeagueWithWorld(input: {
  ownerId: string;
  name: string;
  size: LeagueSize;
  seed: string;
  world: GeneratedWorld;
}): Promise<LeagueRow> {
  const { world } = input;
  const teams = world.teams.map((t) => ({
    abbreviation: t.abbreviation,
    city: t.city,
    nickname: t.nickname,
    conference: t.conference,
    division: t.division,
    primary_color: t.primaryColor,
    secondary_color: t.secondaryColor,
  }));
  const players = playerRows(world.players);

  const { data, error } = await createAdminClient().rpc("admin_create_league", {
    owner: input.ownerId,
    league_name: input.name,
    league_size: input.size,
    league_seed: input.seed,
    league_rng_state: [...world.rngState],
    world_teams: teams,
    world_players: players,
  });
  if (error) throw error;
  return data;
}

/**
 * Writes an Owner Mode league (structure, local players, franchises and
 * roster) in one transaction through public.admin_create_owner_league(),
 * which only the service role may call. The database re-checks everything.
 */
export async function insertOwnerLeagueWithWorld(input: {
  ownerId: string;
  name: string;
  size: "standard" | "custom";
  config: LeagueConfig;
  seed: string;
  world: GeneratedOwnerWorld;
}): Promise<LeagueRow> {
  const { world } = input;
  const conferences = world.structure.conferences.map((c, i) => ({
    id: c.id,
    name: c.name,
    sort_order: i,
  }));
  const divisions = world.structure.conferences.flatMap((c) =>
    c.divisions.map((d, i) => ({
      id: d.id,
      conference_id: c.id,
      name: d.name,
      sort_order: i,
    })),
  );
  const teams = world.teams.map((t) => ({
    abbreviation: t.abbreviation,
    city: t.city,
    nickname: t.nickname,
    conference_id: t.conferenceId,
    division_id: t.divisionId,
    city_id: t.cityId,
    logo_id: t.logoId,
    primary_color: t.primaryColor,
    secondary_color: t.secondaryColor,
    local_player_slot: t.localPlayerSlot,
    ai_trades: t.aiAssist.trades,
    ai_roster_coverage: t.aiAssist.rosterCoverage,
    ai_roster_management: t.aiAssist.rosterManagement,
    ai_scouting: t.aiAssist.scouting,
    ai_drafting: t.aiAssist.drafting,
  }));

  const { data, error } = await createAdminClient().rpc(
    "admin_create_owner_league",
    {
      owner: input.ownerId,
      league_name: input.name,
      league_size: input.size,
      league_config: input.config,
      league_seed: input.seed,
      league_rng_state: [...world.rngState],
      world_conferences: conferences,
      world_divisions: divisions,
      world_local_players: world.localPlayers.map((p) => ({
        slot: p.slot,
        label: p.label,
      })),
      world_teams: teams,
      world_players: playerRows(world.players),
    },
  );
  if (error) throw error;
  return data;
}
