import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Keyed hashing for spam protection. RATE_LIMIT_SECRET is a random,
 * server-only value (see .env.example). It turns IP addresses into codes
 * that can't be reversed, and signs the time a form was shown.
 */
function secret(): string {
  const value = process.env.RATE_LIMIT_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "RATE_LIMIT_SECRET is not set (at least 32 random characters, server only).",
    );
  }
  return value;
}

function sign(purpose: string, value: string): string {
  return createHmac("sha256", secret())
    .update(`${purpose}:${value}`)
    .digest("base64url");
}

/**
 * The rate-limit identity for a request: the signed-in user, or a keyed hash
 * of the client IP address. The raw address is never stored.
 */
export function senderKey(request: {
  userId: string | null;
  forwardedFor: string | null;
}): string {
  if (request.userId) return `u:${sign("sender", `user:${request.userId}`)}`;
  // Render's proxy puts the client address first. A client can prepend a
  // fake one; the database's overall daily cap still bounds abuse.
  const ip = request.forwardedFor?.split(",")[0]?.trim() || "unknown";
  return `i:${sign("sender", `ip:${ip}`)}`;
}

/** Forms must be open at least this long before they're sent: bots are faster. */
export const FORM_MIN_AGE_MS = 2_000;
const FORM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A signed "this form was shown at" stamp for a hidden field. */
export function issueFormToken(now = Date.now()): string {
  const issued = String(now);
  return `${issued}.${sign("form", issued)}`;
}

export type FormTokenCheck = "ok" | "too_fast" | "invalid";

export function checkFormToken(
  token: string,
  now = Date.now(),
): FormTokenCheck {
  const [issued = "", signature = ""] = token.split(".");
  if (!/^\d{1,16}$/.test(issued)) return "invalid";
  const expected = Buffer.from(sign("form", issued));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return "invalid";
  }
  const age = now - Number(issued);
  if (age < 0 || age > FORM_MAX_AGE_MS) return "invalid";
  if (age < FORM_MIN_AGE_MS) return "too_fast";
  return "ok";
}
