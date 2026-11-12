"use server";

import {
  CreateLeagueRequestSchema,
  StructureNameSchema,
  RenameLeagueRequestSchema,
} from "@fullcourt/validation";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms/form";
import { getUserContext } from "@/server/auth/session";
import { invalid, serviceMessage, text } from "@/server/forms";
import { trackEvent } from "@/server/analytics/track";
import { chooseTeam, renameStructure } from "@/server/services/world";
import {
  createLeague,
  deleteLeague,
  getLeague,
  renameLeague,
} from "@/server/services/leagues";

/*
 * Server Actions behind the league forms. Each checks the session itself and
 * goes through the same services as /api/v1/leagues.
 */

export async function createLeagueAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  let json: unknown;
  try {
    json = JSON.parse(text(form, "request"));
  } catch {
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
    };
  }
  const parsed = CreateLeagueRequestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your league settings.",
    };
  }

  const ctx = await getUserContext();
  if (!ctx) redirect("/login?next=/leagues/new");

  let leagueId: string;
  try {
    leagueId = (await createLeague(ctx, parsed.data)).id;
    await trackEvent("league_created");
  } catch (error) {
    return { status: "error", message: serviceMessage(error) };
  }
  redirect(`/leagues/${leagueId}`);
}

export async function renameLeagueAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const leagueId = text(form, "leagueId");
  const values = { name: text(form, "name") };
  const parsed = RenameLeagueRequestSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const ctx = await getUserContext();
  if (!ctx)
    redirect(`/login?next=/leagues/${encodeURIComponent(leagueId)}/settings`);
  try {
    const league = await renameLeague(ctx, leagueId, parsed.data);
    return {
      status: "success",
      message: "League renamed.",
      values: { name: league.name },
    };
  } catch (error) {
    return { status: "error", message: serviceMessage(error), values };
  }
}

export async function deleteLeagueAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const leagueId = text(form, "leagueId");
  const ctx = await getUserContext();
  if (!ctx) redirect("/login?next=/leagues");

  try {
    const league = await getLeague(ctx, leagueId);
    if (text(form, "confirm").trim() !== league.name) {
      const message = `Type the league name, ${league.name}, to confirm.`;
      return { status: "error", message, fieldErrors: { confirm: message } };
    }
    await deleteLeague(ctx, leagueId);
  } catch (error) {
    return { status: "error", message: serviceMessage(error) };
  }
  redirect("/leagues?notice=league-deleted");
}

/** Picks the team the user runs, then shows the league overview. */
export async function chooseTeamAction(form: FormData): Promise<void> {
  const leagueId = text(form, "leagueId");
  const ctx = await getUserContext();
  if (!ctx) redirect(`/login?next=/leagues/${encodeURIComponent(leagueId)}`);
  await chooseTeam(ctx, leagueId, { teamId: text(form, "teamId") });
  await trackEvent("team_selected");
  redirect(`/leagues/${encodeURIComponent(leagueId)}?notice=team-chosen`);
}

/**
 * Renames conferences and divisions from the league settings form. Fields are
 * named `conference:<id>` and `division:<id>`; ids are what the server uses.
 */
export async function renameStructureAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const leagueId = text(form, "leagueId");
  const conferences: { id: string; name: string }[] = [];
  const divisions: { id: string; name: string }[] = [];
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    const [kind, ...rest] = key.split(":");
    const id = rest.join(":");
    if ((kind !== "conference" && kind !== "division") || !id) continue;
    values[key] = value;
    const parsed = StructureNameSchema.safeParse(value);
    if (!parsed.success) {
      errors[key] = parsed.error.issues[0]?.message ?? "Enter a name.";
      continue;
    }
    (kind === "conference" ? conferences : divisions).push({
      id,
      name: parsed.data,
    });
  }
  if (Object.keys(errors).length > 0) {
    return {
      status: "error",
      message: "Check the highlighted names.",
      fieldErrors: errors,
      values,
    };
  }

  const ctx = await getUserContext();
  if (!ctx)
    redirect(`/login?next=/leagues/${encodeURIComponent(leagueId)}/settings`);
  try {
    await renameStructure(ctx, leagueId, { conferences, divisions });
    return { status: "success", message: "Names saved.", values };
  } catch (error) {
    return { status: "error", message: serviceMessage(error), values };
  }
}
