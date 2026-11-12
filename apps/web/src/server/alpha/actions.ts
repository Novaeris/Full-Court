"use server";

import type { FormState } from "@/components/forms/form";
import { ALPHA_NOTICE, TERMS } from "@/content/policies";
import { getUserContext } from "@/server/auth/session";
import { text } from "@/server/forms";
import { acknowledge, getAcknowledgments } from "@/server/services/account";

/**
 * The first-sign-in alpha introduction. Records the current alpha-notice
 * version and, for accounts that predate the current Terms, their acceptance.
 * Versions come from the server, never from the form.
 */
export async function acknowledgeAlphaAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await getUserContext();
  if (!ctx) {
    return { status: "error", message: "Sign in again to continue." };
  }
  try {
    const current = await getAcknowledgments(ctx);
    const needsTerms = (current.termsVersion ?? 0) < TERMS.version;
    if (needsTerms && text(form, "acceptTerms") !== "on") {
      return {
        status: "error",
        message: "Check the box to agree to the Terms.",
        fieldErrors: { acceptTerms: "Agree to the Terms to keep playing." },
      };
    }
    await acknowledge(ctx, {
      alphaNoticeVersion: ALPHA_NOTICE.version,
      ...(needsTerms ? { termsVersion: TERMS.version } : {}),
    });
  } catch (error) {
    console.error(
      "alpha notice:",
      error instanceof Error ? error.message : error,
    );
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
    };
  }
  return { status: "success" };
}
