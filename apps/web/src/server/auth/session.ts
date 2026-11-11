import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createCookieClient, type Supabase } from "@/lib/supabase/server";
import { safeNextPath } from "./redirects";

/**
 * The single seam for "who is signing in" on the web (docs/ARCHITECTURE.md §3).
 * Everything that needs the user goes through here, so auth can change
 * without touching pages.
 */
export type CurrentUser = {
  id: string;
  email: string;
};

export type UserContext = {
  user: CurrentUser;
  /** Supabase client acting as this user: queries run under RLS. */
  supabase: Supabase;
};

/**
 * Returns the signed-in user, or null. The JWT is verified (getClaims), never
 * trusted from the cookie as-is. Cached for the duration of one request.
 */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  // Verifying a session compares token expiry with the clock, so it must run
  // at request time, never while Next prerenders a shell.
  await connection();
  const supabase = await createCookieClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) {
    return null;
  }
  return {
    user: { id: data.claims.sub, email: data.claims.email ?? "" },
    supabase,
  };
});

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return (await getUserContext())?.user ?? null;
}

/** Returns the user context, or sends the visitor to sign in and come back. */
export async function requireUserContext(
  returnTo: string,
): Promise<UserContext> {
  const context = await getUserContext();
  if (!context) {
    redirect(`/login?next=${encodeURIComponent(safeNextPath(returnTo))}`);
  }
  return context;
}
