import "server-only";
import type { Database } from "@fullcourt/api-client";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";
import type { Supabase } from "@/lib/supabase/server";

/**
 * Supabase client with the secret key. It bypasses row-level security, so it
 * lives only in this folder (enforced by scripts/check-boundaries.mjs) and is
 * used only for writes no user may make themselves, such as creating a
 * league's generated world. Callers must check the user's rights first.
 */
export function createAdminClient(): Supabase {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. Add it to the server environment (never NEXT_PUBLIC_).",
    );
  }
  return createClient<Database>(supabaseConfig().url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
