import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/ui/icon";
import { getUserContext } from "@/server/auth/session";
import { getProfile } from "@/server/services/account";

const SLOT =
  "inline-flex min-h-touch max-w-full items-center gap-2 rounded-full px-2 text-sm font-semibold text-text-muted hover:bg-surface-muted hover:text-text";

/**
 * The app shell's account area: "Sign in" for visitors, the user's name and
 * initial for members. Streams in behind Suspense, so the rest of the shell
 * stays static.
 */
export function AccountSlot() {
  return (
    <Suspense
      fallback={<span aria-hidden="true" className="inline-block h-11 w-11" />}
    >
      <Account />
    </Suspense>
  );
}

/** The signed-in member's display name and avatar initial, or null. */
export async function getAccountSummary(): Promise<{
  name: string;
  initial: string;
} | null> {
  const ctx = await getUserContext();
  if (!ctx) return null;
  const name = await getProfile(ctx)
    .then((p) => p.displayName)
    .catch(() => ctx.user.email);
  return { name, initial: name.trim().charAt(0).toUpperCase() || "?" };
}

/** "Sign in" for visitors; the label hides on the tablet rail. */
export function SignInSlot() {
  return (
    <Link href="/login" className={SLOT}>
      <Icon name="user" className="size-5 shrink-0" />
      <span className="tablet:sr-only desktop:not-sr-only">Sign in</span>
    </Link>
  );
}

async function Account() {
  const account = await getAccountSummary();
  if (!account) return <SignInSlot />;
  const { name, initial } = account;

  return (
    <Link href="/account" className={SLOT}>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-on-accent-soft"
      >
        {initial}
      </span>
      <span className="truncate tablet:sr-only desktop:not-sr-only">
        <span className="sr-only">Account: </span>
        {name}
      </span>
    </Link>
  );
}
