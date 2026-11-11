"use client";

import { useActionState } from "react";
import {
  Field,
  FormMessage,
  IDLE,
  SubmitButton,
} from "@/components/forms/form";
import {
  createLeagueAction,
  deleteLeagueAction,
  renameLeagueAction,
} from "@/server/leagues/actions";

export function CreateLeagueForm() {
  const [state, action] = useActionState(createLeagueAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="League name"
        name="name"
        required
        maxLength={40}
        autoComplete="off"
        hint="Up to 40 characters. You can rename it later."
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <LeagueSizeChoice selected={state.values?.size ?? "standard"} />
      <div>
        <SubmitButton pendingLabel="Generating your league…">
          Create league
        </SubmitButton>
      </div>
    </form>
  );
}

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

const SIZES = [
  {
    value: "standard",
    label: "Standard",
    detail:
      "30 teams in two conferences of three divisions. The full experience.",
  },
  {
    value: "compact",
    label: "Compact",
    detail: "12 teams in two conferences of two divisions. Quicker seasons.",
  },
] as const;

function LeagueSizeChoice({ selected }: { selected: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-semibold">League size</legend>
      {SIZES.map((size) => (
        <label
          key={size.value}
          className="flex min-h-touch cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 has-checked:border-accent has-checked:bg-accent-soft"
        >
          <input
            type="radio"
            name="size"
            value={size.value}
            defaultChecked={selected === size.value}
            className="mt-1 size-5 accent-(--color-accent)"
          />
          <span>
            <span className="block font-semibold">{size.label}</span>
            <span className="block text-sm text-text-muted">{size.detail}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
