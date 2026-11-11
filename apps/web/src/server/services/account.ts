import "server-only";
import type {
  DeleteAccountRequest,
  Profile,
  UpdateProfileRequest,
} from "@fullcourt/validation";
import { createStatelessClient } from "@/lib/supabase/server";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";

/**
 * Account use-cases, shared by Server Actions (web) and /api/v1 (every
 * client). Each takes the caller's context; queries run under RLS as them.
 */

export async function getProfile(ctx: UserContext): Promise<Profile> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", ctx.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ApiError(
      404,
      "profile_not_found",
      "No profile for this account.",
    );
  }
  return { id: data.id, email: ctx.user.email, displayName: data.display_name };
}

export async function updateDisplayName(
  ctx: UserContext,
  input: UpdateProfileRequest,
): Promise<Profile> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .update({ display_name: input.displayName })
    .eq("id", ctx.user.id)
    .select("id, display_name")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ApiError(
      404,
      "profile_not_found",
      "No profile for this account.",
    );
  }
  return { id: data.id, email: ctx.user.email, displayName: data.display_name };
}

/**
 * Re-checks a user's password before a sensitive change. Signs in on a
 * throwaway client, confirms it is the same user, then revokes that extra
 * session straight away.
 */
export async function verifyPassword(
  ctx: UserContext,
  password: string,
): Promise<boolean> {
  if (!ctx.user.email) return false;
  const verifier = createStatelessClient();
  const { data, error } = await verifier.auth.signInWithPassword({
    email: ctx.user.email,
    password,
  });
  if (error || data.user?.id !== ctx.user.id) {
    return false;
  }
  await verifier.auth.signOut({ scope: "local" });
  return true;
}

export async function requirePassword(
  ctx: UserContext,
  password: string,
): Promise<void> {
  if (!(await verifyPassword(ctx, password))) {
    throw new ApiError(403, "wrong_password", "That password is incorrect.");
  }
}

/** Permanently deletes the caller's account and, by cascade, all their data. */
export async function deleteAccount(
  ctx: UserContext,
  input: DeleteAccountRequest,
): Promise<void> {
  await requirePassword(ctx, input.password);
  const { error } = await ctx.supabase.rpc("delete_own_account");
  if (error) throw error;
}
