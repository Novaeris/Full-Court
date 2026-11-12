import "server-only";

/**
 * Sends plain-text email through Resend's HTTP API (no SDK dependency).
 * RESEND_API_KEY and SUPPORT_EMAIL_FROM are server-only settings; without
 * them nothing is sent and the caller is told so.
 */
export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<"sent" | "not_configured"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SUPPORT_EMAIL_FROM;
  if (!apiKey || !from) return "not_configured";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // The response body can echo our request; log only the status.
    throw new Error(`Resend rejected the email (HTTP ${response.status}).`);
  }
  return "sent";
}
