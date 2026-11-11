"use client";

import {
  SUPPORT_CATEGORIES,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_NAME_MAX,
  SUPPORT_SUBJECT_MAX,
} from "@fullcourt/validation";
import { useActionState } from "react";
import {
  Field,
  FormMessage,
  IDLE,
  SelectField,
  SubmitButton,
  TextAreaField,
} from "@/components/forms/form";
import { submitSupportAction } from "@/server/support/actions";

export function SupportForm({
  formToken,
  defaultName = "",
  defaultEmail = "",
}: {
  formToken: string;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [state, action] = useActionState(submitSupportAction, IDLE);
  if (state.status === "success") {
    return <FormMessage state={state} />;
  }
  const values = state.values;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="formToken" value={formToken} />
      {/* Honeypot: hidden from people and assistive technology; bots fill it in. */}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Field
        label="Name"
        name="name"
        autoComplete="name"
        required
        maxLength={SUPPORT_NAME_MAX}
        defaultValue={values?.name ?? defaultName}
        error={state.fieldErrors?.name}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        hint="We only use it to reply to you."
        defaultValue={values?.email ?? defaultEmail}
        error={state.fieldErrors?.email}
      />
      <SelectField
        label="Category"
        name="category"
        required
        placeholder="Choose a category"
        options={SUPPORT_CATEGORIES}
        defaultValue={values?.category ?? ""}
        error={state.fieldErrors?.category}
      />
      <Field
        label="Subject"
        name="subject"
        required
        maxLength={SUPPORT_SUBJECT_MAX}
        defaultValue={values?.subject}
        error={state.fieldErrors?.subject}
      />
      <TextAreaField
        label="Message"
        name="message"
        required
        rows={8}
        maxLength={SUPPORT_MESSAGE_MAX}
        hint="For bugs, say what you did, what you expected and what happened instead. Never include your password."
        defaultValue={values?.message}
        error={state.fieldErrors?.message}
      />
      <SubmitButton pendingLabel="Sending…" className="w-full tablet:w-auto">
        Send
      </SubmitButton>
    </form>
  );
}
