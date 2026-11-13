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

/** Creates the draft class as prospects. */
export async function createProspects(
  seasonId: string,
  prospects: readonly Record<string, unknown>[],
): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_create_prospects", {
    target_season: seasonId,
    prospects: prospects as never,
  });
  if (error) throw error;
}

/** Stores the draft order after the lottery. */
export async function holdLottery(
  seasonId: string,
  slots: readonly Record<string, unknown>[],
): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_hold_lottery", {
    target_season: seasonId,
    slots: slots as never,
  });
  if (error) throw error;
}

/** Makes the next picks in order; the draft ends after the last. */
export async function makePicks(
  seasonId: string,
  picks: readonly {
    pick: number;
    player_id: string;
    salary: number;
    years: number;
  }[],
): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc("admin_make_picks", {
    target_season: seasonId,
    picks: picks as never,
  });
  if (error) throw error;
  return data;
}

/** Signs a free agent onto a team. */
export async function signPlayer(input: {
  seasonId: string;
  teamId: string;
  playerId: string;
  salary: number;
  years: number;
}): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_sign_player", {
    target_season: input.seasonId,
    sign_team: input.teamId,
    player: input.playerId,
    sign_salary: input.salary,
    sign_years: input.years,
  });
  if (error) throw error;
}

/** Releases a player from a team into free agency. */
export async function releasePlayer(input: {
  seasonId: string;
  teamId: string;
  playerId: string;
}): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_release_player", {
    target_season: input.seasonId,
    release_team: input.teamId,
    player: input.playerId,
  });
  if (error) throw error;
}

/** Sets any of a team's AI Assist switches. */
export async function setAiAssist(
  teamId: string,
  flags: Record<string, boolean>,
): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_set_ai_assist", {
    target_team: teamId,
    flags,
  });
  if (error) throw error;
}

/** Gives a league's players their first contracts. */
export async function ensureContractsFor(
  leagueId: string,
  contracts: readonly { id: string; salary: number; expires: number }[],
): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_ensure_contracts", {
    target_league: leagueId,
    contracts: contracts as never,
  });
  if (error) throw error;
}

/** Makes or changes an offer from a team to a free agent. */
export async function makeOffer(input: {
  seasonId: string;
  teamId: string;
  playerId: string;
  salary: number;
  years: number;
}): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_make_offer", {
    target_season: input.seasonId,
    offer_team: input.teamId,
    player: input.playerId,
    offer_salary: input.salary,
    offer_years: input.years,
  });
  if (error) throw error;
}

/** Withdraws a pending offer. */
export async function withdrawOffer(
  seasonId: string,
  offerId: string,
): Promise<void> {
  const { error } = await createAdminClient().rpc("admin_withdraw_offer", {
    target_season: seasonId,
    offer: offerId,
  });
  if (error) throw error;
}

/** Applies one day of free agency. */
export async function applyFaDay(input: {
  seasonId: string;
  newOffers: readonly Record<string, unknown>[];
  raised: readonly Record<string, unknown>[];
  signings: readonly Record<string, unknown>[];
  lapsed: readonly Record<string, unknown>[];
}): Promise<SeasonRow> {
  const { data, error } = await createAdminClient().rpc("admin_apply_fa_day", {
    target_season: input.seasonId,
    new_offers: input.newOffers as never,
    raised: input.raised as never,
    signings: input.signings as never,
    lapsed: input.lapsed as never,
  });
  if (error) throw error;
  return data;
}
