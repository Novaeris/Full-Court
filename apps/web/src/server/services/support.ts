import "server-only";
import { SUPPORT_CATEGORIES, type SupportRequest } from "@fullcourt/validation";
import { after } from "next/server";
import { SITE } from "@/content/site";
import { insertSupportRequest } from "@/server/admin/support";
import { sendEmail } from "@/server/email/resend";

export type SupportResult = "received" | "rate_limited";

/**
 * Stores a support request (rate limited in the database) and, after the
 * response is sent, emails a copy to the support inbox. The request is safe
 * in the database even when the email fails.
 */
export async function submitSupportRequest(input: {
  request: SupportRequest;
  userId: string | null;
  senderKey: string;
}): Promise<SupportResult> {
  const id = await insertSupportRequest(input);
  if (!id) return "rate_limited";

  after(async () => {
    try {
      const result = await sendEmail(
        supportEmail(id, input.request, input.userId),
      );
      if (result === "not_configured") {
        console.warn(
          `support: request ${id} stored; email notifications are not configured.`,
        );
      }
    } catch (error) {
      console.error(
        `support: request ${id} stored but the email failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  });
  return "received";
}

export function supportEmail(
  id: string,
  request: SupportRequest,
  userId: string | null,
) {
  const category =
    SUPPORT_CATEGORIES.find((c) => c.value === request.category)?.label ??
    request.category;
  return {
    to: SITE.contactEmail,
    replyTo: request.email,
    subject: `[${SITE.name}] ${category}: ${request.subject}`,
    text: [
      `New ${SITE.name} support request`,
      "",
      `Category: ${category}`,
      `From: ${request.name} <${request.email}>`,
      `Account: ${userId ? `signed in (${userId})` : "not signed in"}`,
      `Reference: ${id}`,
      `Subject: ${request.subject}`,
      "",
      request.message,
      "",
      "--",
      "Reply to this email to answer the sender. Delete this email 12 months after it arrived (Privacy Policy).",
    ].join("\n"),
  };
}
