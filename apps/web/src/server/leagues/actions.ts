"use server";

import {
  CreateLeagueRequestSchema,
  RenameLeagueRequestSchema,
} from "@fullcourt/validation";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms/form";
import { getUserContext } from "@/server/auth/session";
import { invalid, serviceMessage, text } from "@/server/forms";
import { chooseTeam } from "@/server/services/world";
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
  const values = { name: text(form, "name"), size: text(form, "size") };
  const parsed = CreateLeagueRequestSchema.safeParse({
    name: values.name,
    size: values.size || undefined,
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const ctx = await getUserContext();
  if (!ctx) redirect("/login?next=/leagues/new");

  let leagueId: string;
  try {
    leagueId = (await createLeague(ctx, parsed.data)).id;
  } catch (error) {
    return { status: "error", message: serviceMessage(error), values };
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
  redirect(`/leagues/${encodeURIComponent(leagueId)}?notice=team-chosen`);
}
