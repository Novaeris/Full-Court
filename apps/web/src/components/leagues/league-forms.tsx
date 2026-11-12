"use client";

import { useActionState } from "react";
import {
  Field,
  FormMessage,
  IDLE,
  SubmitButton,
} from "@/components/forms/form";
import {
  deleteLeagueAction,
  renameLeagueAction,
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
