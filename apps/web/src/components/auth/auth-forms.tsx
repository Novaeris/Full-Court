"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ALPHA_NOTICE } from "@/content/policies";
import { SITE } from "@/content/site";
import { sendAnalyticsEvent } from "@/components/analytics/send-event";
import {
  CheckboxField,
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
    <form
      action={action}
      className="flex flex-col gap-4"
      noValidate
      onFocusCapture={registrationStarted}
    >
      <FormMessage state={state} />
      <AlphaConditions />
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
      <CheckboxField
        name="acceptTerms"
        required
        error={state.fieldErrors?.acceptTerms}
        label={
          <>
            I am at least {SITE.minimumAge}, I agree to the{" "}
            <PolicyLink href="/terms">Terms of Service</PolicyLink> and{" "}
            <PolicyLink href="/acceptable-use">
              Acceptable Use Policy
            </PolicyLink>
            , and I have read the{" "}
            <PolicyLink href="/alpha">Alpha Disclaimer</PolicyLink> and{" "}
            <PolicyLink href="/privacy">Privacy Policy</PolicyLink>.
          </>
        }
      />
      <SubmitButton pendingLabel="Creating account…" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}

/** Counts one "registration started" the first time someone uses the form. */
let registrationCounted = false;
function registrationStarted() {
  if (registrationCounted) return;
  registrationCounted = true;
  sendAnalyticsEvent("registration_started");
}

/** The alpha conditions, stated before anyone signs up. */
function AlphaConditions() {
  return (
    <div
      role="note"
      aria-label="Open alpha"
      className="rounded-md border border-border bg-accent-soft px-4 py-3 text-on-accent-soft"
    >
      <p className="font-semibold">{ALPHA_NOTICE.title}</p>
      <ul className="mt-2 ml-5 flex list-disc flex-col gap-1 text-sm">
        {ALPHA_NOTICE.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

/** Policy links in the sign-up form open in a new tab so the form keeps its input. */
function PolicyLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      className="font-semibold underline underline-offset-4"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </Link>
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
