import "server-only";
import type { Database } from "@fullcourt/api-client";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseConfig } from "@/lib/env";

export type Supabase = SupabaseClient<Database>;

/**
 * Supabase client acting as the signed-in web user, from the session cookies.
 * Queries run under RLS as that user. Call it per request; never share it.
 */
export async function createCookieClient(): Promise<Supabase> {
  const { url, publishableKey } = supabaseConfig();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore there.
        }
      },
    },
  });
}

/**
 * Supabase client acting as the user who owns `accessToken` (mobile and
 * desktop send it as a Bearer token). It never stores or refreshes sessions.
 */
export function createTokenClient(accessToken: string): Supabase {
  const { url, publishableKey } = supabaseConfig();
  return createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * A client with no user and no stored session, for one-off checks such as
 * confirming a password before a sensitive change.
 */
export function createStatelessClient(): Supabase {
  const { url, publishableKey } = supabaseConfig();
  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
