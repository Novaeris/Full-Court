import "server-only";
import { createTokenClient } from "@/lib/supabase/server";
import { getUserContext, type UserContext } from "@/server/auth/session";
import { ApiError } from "./handler";

/**
 * Identifies the caller of an /api/v1 request.
 *
 * - Mobile and desktop send `Authorization: Bearer <Supabase access token>`.
 * - The website sends its session cookie.
 *
 * Either way the token is verified, and the returned client queries as that
 * user, so RLS still applies inside the API.
 */
export async function authenticate(request: Request): Promise<UserContext> {
  const header = request.headers.get("authorization");
  if (header !== null) {
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match?.[1]) {
      throw new ApiError(
        401,
        "unauthorized",
        "Malformed Authorization header.",
      );
    }
    const token = match[1];
    const supabase = createTokenClient(token);
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims.sub) {
      throw new ApiError(401, "unauthorized", "Sign in to continue.");
    }
    return {
      user: { id: data.claims.sub, email: data.claims.email ?? "" },
      supabase,
    };
  }

  const context = await getUserContext();
  if (!context) {
    throw new ApiError(401, "unauthorized", "Sign in to continue.");
  }
  return context;
}
