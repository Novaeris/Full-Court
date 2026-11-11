/** Where people land after signing in when no destination was requested. */
export const DEFAULT_AFTER_SIGN_IN = "/leagues";

/**
 * Accepts only same-site relative paths ("/leagues", "/account?x=1"). Anything
 * else (absolute URLs, protocol-relative "//evil.test", backslash tricks)
 * falls back to the default, so ?next= can't become an open redirect.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = DEFAULT_AFTER_SIGN_IN,
): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  try {
    const parsed = new URL(next, "http://placeholder.invalid");
    if (parsed.origin !== "http://placeholder.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Origin used in links inside auth emails. Must be on the Supabase redirect
 * allowlist. Render sets RENDER_EXTERNAL_URL for each service.
 */
export function siteUrl(): string {
  const raw =
    process.env.SITE_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** The /auth/confirm link that an auth email should return to. */
export function confirmUrl(next: string): string {
  return `${siteUrl()}/auth/confirm?next=${encodeURIComponent(safeNextPath(next))}`;
}
