"use server";

import {
  ChangeEmailRequestSchema,
  ChangePasswordRequestSchema,
  DeleteAccountRequestSchema,
  NewPasswordRequestSchema,
  PasswordResetRequestSchema,
  SignInRequestSchema,
  SignUpRequestSchema,
  UpdateProfileRequestSchema,
} from "@fullcourt/validation";
import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms/form";
import { createCookieClient } from "@/lib/supabase/server";
import { invalid, serviceMessage, text } from "@/server/forms";
import {
  deleteAccount,
  requirePassword,
  updateDisplayName,
} from "@/server/services/account";
import { TERMS } from "@/content/policies";
import { trackEvent } from "@/server/analytics/track";
import { DELETE_CONFIRMATION } from "./constants";
import { confirmUrl, safeNextPath } from "./redirects";
import { getUserContext } from "./session";

/*
 * Server Actions behind the account forms. Each one validates its input with
 * the shared schemas and checks the session itself; nothing trusts the form.
 */

/** Plain-language messages for Supabase Auth errors. */
function authMessage(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "email_not_confirmed":
      return "Confirm your email first. We can send the link again.";
    case "weak_password":
      return "That password is too easy to guess. Try a longer one.";
    case "same_password":
      return "Choose a password you haven't used here before.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    case "email_address_invalid":
      return "That email address can't be used.";
    case "email_exists":
      return "That email address is already in use.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// Signing up and in --------------------------------------------------------------

export async function signUpAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const values = {
    displayName: text(form, "displayName"),
    email: text(form, "email"),
  };
  const parsed = SignUpRequestSchema.safeParse({
    ...values,
    password: text(form, "password"),
    acceptTerms: text(form, "acceptTerms") === "on",
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createCookieClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: confirmUrl("/leagues"),
      // Recorded on the profile with the sign-up time (profiles trigger).
      data: {
        display_name: parsed.data.displayName,
        terms_version: String(TERMS.version),
      },
    },
  });
  if (error) {
    return { status: "error", message: authMessage(error), values };
  }
  if (data.session) {
    // Email confirmation is switched off in this environment.
    await trackEvent("registration_completed");
    redirect("/leagues");
  }
  // Same message whether or not the address already had an account, so the
  // form can't be used to find out who has signed up.
  return {
    status: "success",
    message: `Check ${parsed.data.email} for a link to confirm your account.`,
    values: { email: parsed.data.email },
  };
}

export async function resendConfirmationAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = PasswordResetRequestSchema.safeParse({
    email: text(form, "email"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createCookieClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: confirmUrl("/leagues") },
  });
  if (error && error.code?.startsWith("over_")) {
    return { status: "error", message: authMessage(error) };
  }
  return {
    status: "success",
    message: `If ${parsed.data.email} is waiting for confirmation, a new link is on its way.`,
  };
}

export async function signInAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const values = { email: text(form, "email") };
  const parsed = SignInRequestSchema.safeParse({
    ...values,
    password: text(form, "password"),
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createCookieClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      status: "error",
      message: authMessage(error),
      values,
      ...(error.code === "email_not_confirmed"
        ? { fieldErrors: { unconfirmed: "true" } }
        : {}),
    };
  }
  redirect(safeNextPath(text(form, "next")));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createCookieClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

// Passwords ------------------------------------------------------------------------

export async function requestPasswordResetAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const values = { email: text(form, "email") };
  const parsed = PasswordResetRequestSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createCookieClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: confirmUrl("/reset-password") },
  );
  if (error && error.code?.startsWith("over_")) {
    return { status: "error", message: authMessage(error), values };
  }
  return {
    status: "success",
    message: `If an account uses ${parsed.data.email}, we've sent it a link to reset the password.`,
  };
}

/** Sets a new password after following a reset link (a recovery session). */
export async function setNewPasswordAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = NewPasswordRequestSchema.safeParse({
    password: text(form, "password"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const ctx = await getUserContext();
  if (!ctx) {
    return {
      status: "error",
      message: "This reset link has expired. Request a new one.",
    };
  }
  const { error } = await ctx.supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { status: "error", message: authMessage(error) };
  redirect("/account?notice=password-reset");
}

export async function changePasswordAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = ChangePasswordRequestSchema.safeParse({
    currentPassword: text(form, "currentPassword"),
    newPassword: text(form, "newPassword"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const ctx = await getUserContext();
  if (!ctx) redirect("/login?next=/account");
  try {
    await requirePassword(ctx, parsed.data.currentPassword);
  } catch (error) {
    return {
      status: "error",
      message: serviceMessage(error),
      fieldErrors: { currentPassword: serviceMessage(error) },
    };
  }
  const { error } = await ctx.supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) return { status: "error", message: authMessage(error) };
  return { status: "success", message: "Your password has been changed." };
}

// Profile and email -----------------------------------------------------------------

export async function updateDisplayNameAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const values = { displayName: text(form, "displayName") };
  const parsed = UpdateProfileRequestSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const ctx = await getUserContext();
  if (!ctx) redirect("/login?next=/account");
  try {
    const profile = await updateDisplayName(ctx, parsed.data);
    return {
      status: "success",
      message: "Display name saved.",
      values: { displayName: profile.displayName },
    };
  } catch (error) {
    return { status: "error", message: serviceMessage(error), values };
  }
}

export async function changeEmailAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const values = { newEmail: text(form, "newEmail") };
  const parsed = ChangeEmailRequestSchema.safeParse({
    ...values,
    currentPassword: text(form, "currentPassword"),
  });
  if (!parsed.success) return invalid(parsed.error, values);

  const ctx = await getUserContext();
  if (!ctx) redirect("/login?next=/account");
  if (parsed.data.newEmail.toLowerCase() === ctx.user.email.toLowerCase()) {
    return {
      status: "error",
      message: "That's already your email address.",
      fieldErrors: { newEmail: "That's already your email address." },
      values,
    };
  }
  try {
    await requirePassword(ctx, parsed.data.currentPassword);
  } catch (error) {
    return {
      status: "error",
      message: serviceMessage(error),
      fieldErrors: { currentPassword: serviceMessage(error) },
      values,
    };
  }
  const { error } = await ctx.supabase.auth.updateUser(
    { email: parsed.data.newEmail },
    { emailRedirectTo: confirmUrl("/account?notice=email-changed") },
  );
  if (error) return { status: "error", message: authMessage(error), values };
  return {
    status: "success",
    message: `To finish, follow the links we sent to ${ctx.user.email} and ${parsed.data.newEmail}.`,
  };
}

// Deleting the account ----------------------------------------------------------------

export async function deleteAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  if (text(form, "confirm") !== DELETE_CONFIRMATION) {
    return {
      status: "error",
      message: `Type ${DELETE_CONFIRMATION} to confirm.`,
      fieldErrors: { confirm: `Type ${DELETE_CONFIRMATION} to confirm.` },
    };
  }
  const parsed = DeleteAccountRequestSchema.safeParse({
    password: text(form, "password"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const ctx = await getUserContext();
  if (!ctx) redirect("/login?next=/account");
  try {
    await deleteAccount(ctx, parsed.data);
  } catch (error) {
    return {
      status: "error",
      message: serviceMessage(error),
      fieldErrors: { password: serviceMessage(error) },
    };
  }
  // The user no longer exists; clear the session cookies.
  await ctx.supabase.auth.signOut({ scope: "local" });
  redirect("/account-deleted");
}
