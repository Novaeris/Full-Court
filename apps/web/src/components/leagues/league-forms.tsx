"use client";

import { useActionState } from "react";
import {
  Field,
  FormMessage,
  IDLE,
  SubmitButton,
} from "@/components/forms/form";
import type { LeagueStructure } from "@fullcourt/validation";
import {
  deleteLeagueAction,
  renameLeagueAction,
  renameStructureAction,
} from "@/server/leagues/actions";

export function RenameLeagueForm({
  leagueId,
  current,
}: {
  leagueId: string;
  current: string;
}) {
  const [state, action] = useActionState(renameLeagueAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="leagueId" value={leagueId} />
      <FormMessage state={state} />
      <Field
        label="League name"
        name="name"
        required
        maxLength={40}
        autoComplete="off"
        defaultValue={state.values?.name ?? current}
        error={state.fieldErrors?.name}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Rename league</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteLeagueForm({
  leagueId,
  name,
}: {
  leagueId: string;
  name: string;
}) {
  const [state, action] = useActionState(deleteLeagueAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="leagueId" value={leagueId} />
      <FormMessage state={state} />
      <Field
        label={`Type ${name} to confirm`}
        name="confirm"
        required
        autoComplete="off"
        error={state.fieldErrors?.confirm}
      />
      <div>
        <SubmitButton variant="danger" pendingLabel="Deleting…">
          Delete league
        </SubmitButton>
      </div>
    </form>
  );
}

/** Rename conferences and divisions. Ids never change, so nothing breaks. */
export function RenameStructureForm({
  leagueId,
  structure,
}: {
  leagueId: string;
  structure: LeagueStructure;
}) {
  const [state, action] = useActionState(renameStructureAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="leagueId" value={leagueId} />
      <FormMessage state={state} />
      {structure.conferences.map((conference) => (
        <fieldset
          key={conference.id}
          className="flex flex-col gap-3 rounded-lg border border-border p-4"
        >
          <legend className="px-1 font-bold">
            {conference.name} Conference
          </legend>
          <Field
            label="Conference name"
            name={`conference:${conference.id}`}
            required
            maxLength={40}
            autoComplete="off"
            defaultValue={
              state.values?.[`conference:${conference.id}`] ?? conference.name
            }
            error={state.fieldErrors?.[`conference:${conference.id}`]}
          />
          {conference.divisions.map((division) => (
            <Field
              key={division.id}
              label={`Division name (${division.teamCount} teams)`}
              name={`division:${division.id}`}
              required
              maxLength={40}
              autoComplete="off"
              defaultValue={
                state.values?.[`division:${division.id}`] ?? division.name
              }
              error={state.fieldErrors?.[`division:${division.id}`]}
            />
          ))}
        </fieldset>
      ))}
      <div>
        <SubmitButton pendingLabel="Saving…">Save names</SubmitButton>
      </div>
    </form>
  );
}
