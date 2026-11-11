import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createCookieClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/server/auth/redirects";

const ALLOWED_TYPES: readonly EmailOtpType[] = [
  "email",
  "signup",
  "recovery",
  "email_change",
];

/**
 * Landing point for every auth email link (sign-up confirmation, password
 * reset, email change). Exchanges the one-time token_hash for a session,
 * then continues to ?next=.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNextPath(params.get("next"));

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createCookieClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?error=link");
}
