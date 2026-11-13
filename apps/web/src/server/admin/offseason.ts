import "server-only";
import type { Database } from "@fullcourt/api-client";
import { createAdminClient } from "./supabase";

type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
type StaffRow = Database["public"]["Tables"]["staff_members"]["Row"];

/**
 * The offseason's writes. Each is one database function that only the service
 * role may call; the caller has already shown that the user owns the league,
 * and the database refuses a step out of order (`wrong_stage`), a team over
 * its staff budget, or a roster outside 12 to 15.
 */

type Json = readonly Record<string, unknown>[];

/** A new staff member as the database takes him. */
export type StaffInsert = {
  team_id: string | null;
  first_name: string;
  last_name: string;
  role: string;
  rating: number;
  age: number;
  salary: number;
  contract_years: number | null;
};

/** Gives a league its first staff and market. */
export async function createStaff(
  leagueId: string,
  members: readonly StaffInsert[],
): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_create_staff", {
    target_league: leagueId,
    members: members as never,
  });
  if (error) throw error;
}

/** Adds free agents to the staff market. */
export async function addStaff(
  leagueId: string,
  members: readonly StaffInsert[],
): Promise<void> {
  if (members.length === 0) return;
  const { error } = await createAdminClient().rpc("admin_add_staff", {
    target_league: leagueId,
    members: members as never,
  });
  if (error) throw error;
}

/** Ages the players of an archived season and ends staff contracts. */
export async function applyProgression(input: {
  seasonId: string;
  changes: Json;
  staffChanges: Json;
}): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc(
    "admin_apply_progression",
    {
      target_season: input.seasonId,
      changes: input.changes as never,
      staff_changes: input.staffChanges as never,
    },
  );
  if (error) throw error;
  return data;
}

/** Stores the draft; the offseason moves to free agency. */
export async function applyDraft(input: {
  seasonId: string;
  changes: Json;
  lottery: Json;
}): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc("admin_apply_draft", {
    target_season: input.seasonId,
    changes: input.changes as never,
    lottery: input.lottery as never,
  });
  if (error) throw error;
  return data;
}

/** Stores free agency; the offseason moves to training camp. */
export async function applyRosters(input: {
  seasonId: string;
  moves: Json;
  staffMoves: Json;
}): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc("admin_apply_rosters", {
    target_season: input.seasonId,
    moves: input.moves as never,
    staff_moves: input.staffMoves as never,
  });
  if (error) throw error;
  return data;
}

/** Stores the camp; the offseason moves to the preseason. */
export async function applyCamp(input: {
  seasonId: string;
  results: Json;
}): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc("admin_apply_camp", {
    target_season: input.seasonId,
    results: input.results as never,
  });
  if (error) throw error;
  return data;
}

/** Ends the preseason and opens the regular season. */
export async function startSeason(seasonId: string): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc("admin_start_season", {
    target_season: seasonId,
  });
  if (error) throw error;
  return data;
}

/** Hires a staff member from the market into his role. */
export async function hireStaffMember(input: {
  seasonId: string;
  staffId: string;
  teamId: string;
  years: number;
}): Promise<StaffRow> {
  const { data, error } = await createAdminClient().rpc("admin_hire_staff", {
    target_season: input.seasonId,
    staff: input.staffId,
    hire_team: input.teamId,
    years: input.years,
  });
  if (error) throw error;
  return data;
}

/** Lets a staff member go; he joins the market. */
export async function releaseStaffMember(input: {
  seasonId: string;
  staffId: string;
}): Promise<StaffRow> {
  const { data, error } = await createAdminClient().rpc("admin_release_staff", {
    target_season: input.seasonId,
    staff: input.staffId,
  });
  if (error) throw error;
  return data;
}

/** Replaces a team's camp roster. */
export async function setCampRoster(input: {
  seasonId: string;
  teamId: string;
  assignments: readonly { player_id: string; program: string }[];
}): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_set_camp", {
    target_season: input.seasonId,
    camp_team: input.teamId,
    assignments: input.assignments as never,
  });
  if (error) throw error;
}
