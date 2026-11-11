import "server-only";
import type { Database } from "@fullcourt/api-client";
import type { GeneratedWorld } from "@fullcourt/game-engine";
import type { LeagueSize } from "@fullcourt/game-types";
import { createAdminClient } from "./supabase";

type LeagueRow = Database["public"]["Tables"]["leagues"]["Row"];

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
  const players = world.players.map((p) => ({
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
