"use server";

import { SupportRequestSchema } from "@fullcourt/validation";
import { headers } from "next/headers";
import type { FormState } from "@/components/forms/form";
import { SITE } from "@/content/site";
import { getUserContext } from "@/server/auth/session";
import { invalid, text } from "@/server/forms";
import { checkFormToken, senderKey } from "@/server/security/request-signing";
import { submitSupportRequest } from "@/server/services/support";

const RECEIVED: FormState = {
  status: "success",
  message:
    "Thanks, we received your request. If it needs a reply, we'll answer by email.",
};

/**
 * The Contact & Support form. Spam protection, in order: a hidden field that
 * only bots fill in, a signed timestamp (forms sent within two seconds of
 * loading are bots), schema validation, and per-sender and overall rate
 * limits in the database.
 */
export async function submitSupportAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const values = {
    name: text(form, "name"),
    email: text(form, "email"),
    category: text(form, "category"),
    subject: text(form, "subject"),
    message: text(form, "message"),
  };

  // Honeypot: pretend it worked so bots learn nothing.
  if (text(form, "website") !== "") return RECEIVED;

  const token = checkFormToken(text(form, "formToken"));
  if (token === "invalid") {
    return {
      status: "error",
      message: "This form has expired. Reload the page and try again.",
      values,
    };
  }
  if (token === "too_fast") {
    return {
      status: "error",
      message: "That was very quick. Check your message, then send it again.",
      values,
    };
  }

  const parsed = SupportRequestSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const ctx = await getUserContext();
  const requestHeaders = await headers();
  try {
    const result = await submitSupportRequest({
      request: parsed.data,
      userId: ctx?.user.id ?? null,
      senderKey: senderKey({
        userId: ctx?.user.id ?? null,
        forwardedFor: requestHeaders.get("x-forwarded-for"),
      }),
    });
    if (result === "rate_limited") {
      return {
        status: "error",
        message:
          "You've sent several requests recently. Please wait a while before sending another.",
        values,
      };
    }
  } catch (error) {
    console.error("support:", error instanceof Error ? error.message : error);
    return {
      status: "error",
      message: `Your request couldn't be sent. Please try again later, or email ${SITE.contactEmail}.`,
      values,
    };
  }
  return RECEIVED;
}
