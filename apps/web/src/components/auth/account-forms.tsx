"use client";

import { useActionState } from "react";
import {
  Field,
  FormMessage,
  IDLE,
  SubmitButton,
} from "@/components/forms/form";
import { DELETE_CONFIRMATION } from "@/server/auth/constants";
import {
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  updateDisplayNameAction,
} from "@/server/auth/actions";

export function DisplayNameForm({ current }: { current: string }) {
  const [state, action] = useActionState(updateDisplayNameAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        required
        maxLength={40}
        defaultValue={state.values?.displayName ?? current}
        error={state.fieldErrors?.displayName}
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save name</SubmitButton>
      </div>
    </form>
  );
}

export function ChangeEmailForm() {
  const [state, action] = useActionState(changeEmailAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="New email"
        name="newEmail"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.newEmail}
        error={state.fieldErrors?.newEmail}
      />
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />
      <div>
        <SubmitButton variant="secondary" pendingLabel="Sending…">
          Change email
        </SubmitButton>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, IDLE);
  return (
    <form
      action={action}
      key={state.status === "success" ? "done" : "editing"}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormMessage state={state} />
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        hint="At least 10 characters."
        error={state.fieldErrors?.newPassword}
      />
      <div>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Change password
        </SubmitButton>
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label={`Type ${DELETE_CONFIRMATION} to confirm`}
        name="confirm"
        autoComplete="off"
        autoCapitalize="characters"
        required
        error={state.fieldErrors?.confirm}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <div>
        <SubmitButton variant="danger" pendingLabel="Deleting…">
          Delete my account
        </SubmitButton>
      </div>
    </form>
  );
}
