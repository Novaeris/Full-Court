import { Suspense, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { signOutAction } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/session";

/**
 * Renders its children only for signed-in visitors. The session is read at
 * request time behind Suspense, so the surrounding layout stays static.
 */
export function SignedInOnly({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

async function SignedIn({ children }: { children: ReactNode }) {
  return (await getCurrentUser()) ? <>{children}</> : null;
}

const STYLES = {
  /** Desktop sidebar row; on the tablet rail, icon above a small label. */
  sidebar: [
    "flex min-h-touch w-full flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-xs font-medium text-text-muted hover:bg-surface-muted hover:text-text",
    "desktop:flex-row desktop:justify-start desktop:gap-3 desktop:px-3 desktop:text-sm",
  ].join(" "),
  /** A row in the account menu. */
  menu: "flex min-h-touch w-full items-center gap-3 rounded-md px-2 text-sm hover:bg-surface-muted",
  /** A row in the More sheet or the phone menu. */
  row: "flex min-h-touch w-full items-center gap-3 rounded-md px-2 text-base hover:bg-surface-muted",
  /** Plain text button in the site header. */
  header:
    "inline-flex min-h-touch items-center rounded-md px-3 font-semibold text-text hover:bg-surface-muted",
} as const;

/** Signs out on this device, then returns to the home page. */
export function SignOutButton({ look }: { look: keyof typeof STYLES }) {
  return (
    <form
      action={signOutAction}
      className={look === "header" ? undefined : "w-full"}
    >
      <button type="submit" className={STYLES[look]}>
        {look === "header" ? null : (
          <Icon
            name="signOut"
            className={
              look === "sidebar" ? "size-5" : "size-5 shrink-0 text-text-muted"
            }
          />
        )}
        <span>Sign out</span>
      </button>
    </form>
  );
}
