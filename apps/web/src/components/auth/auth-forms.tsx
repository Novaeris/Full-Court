"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  Field,
  FormMessage,
  IDLE,
  SubmitButton,
  type FormState,
} from "@/components/forms/form";
import {
  requestPasswordResetAction,
  resendConfirmationAction,
  setNewPasswordAction,
  signInAction,
  signUpAction,
} from "@/server/auth/actions";

const PASSWORD_HINT = "At least 10 characters. A short phrase works well.";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, IDLE);
  const unconfirmed = state.fieldErrors?.unconfirmed === "true";
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormMessage state={state} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password}
        />
        <SubmitButton pendingLabel="Signing in…" className="w-full">
          Sign in
        </SubmitButton>
      </form>
      {unconfirmed ? (
        <ResendConfirmation email={state.values?.email ?? ""} />
      ) : null}
      <p className="text-center">
        <Link
          href="/forgot-password"
          className="inline-flex min-h-touch items-center font-semibold text-accent underline-offset-4 hover:underline"
        >
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}

function ResendConfirmation({ email }: { email: string }) {
  const [state, action] = useActionState(resendConfirmationAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="email" value={email} />
      <FormMessage state={state} />
      <SubmitButton
        variant="secondary"
        pendingLabel="Sending…"
        className="w-full"
      >
        Send the confirmation link again
      </SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, IDLE);
  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <JunkFolderNote />
        <p className="text-text-muted">
          The link expires in an hour. Still nothing after a few minutes? Send
          it again.
        </p>
        <ResendConfirmation email={state.values?.email ?? ""} />
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        required
        maxLength={40}
        hint="Shown in your leagues. You can change it later."
        defaultValue={state.values?.displayName}
        error={state.fieldErrors?.displayName}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        hint={PASSWORD_HINT}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Creating account…" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {state.status === "success" ? (
        <JunkFolderNote />
      ) : (
        <>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.values?.email}
            error={state.fieldErrors?.email}
          />
          <SubmitButton pendingLabel="Sending…" className="w-full">
            Send reset link
          </SubmitButton>
        </>
      )}
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(
    setNewPasswordAction,
    IDLE,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        hint={PASSWORD_HINT}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Saving…" className="w-full">
        Save new password
      </SubmitButton>
    </form>
  );
}

/** Shown wherever we've just sent an email: new domains often land in junk. */
export function JunkFolderNote() {
  return (
    <div
      role="note"
      className="rounded-md border border-border bg-accent-soft px-4 py-3 text-on-accent-soft"
    >
      <p className="font-semibold">Can&apos;t find the email?</p>
      <p className="mt-1">
        Look in your junk or spam folder. If it&apos;s there, mark it as
        &quot;Not junk&quot; so future emails from Full Court reach your inbox.
      </p>
    </div>
  );
}
