import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { getCurrentUser } from "@/server/auth/session";

type Placement = "header" | "menu" | "hero";

/**
 * Sign in / sign up for visitors, "Open the app" for members. The session is
 * read at request time behind Suspense, so the rest of the page stays static.
 * Most visitors are signed out, so that is what shows while it loads.
 */
export function SiteAuthActions({ placement }: { placement: Placement }) {
  return (
    <Suspense fallback={<Actions placement={placement} signedIn={false} />}>
      <SessionActions placement={placement} />
    </Suspense>
  );
}

async function SessionActions({ placement }: { placement: Placement }) {
  const user = await getCurrentUser();
  return <Actions placement={placement} signedIn={user !== null} />;
}

function Actions({
  placement,
  signedIn,
}: {
  placement: Placement;
  signedIn: boolean;
}) {
  if (placement === "hero") {
    return signedIn ? (
      <ButtonLink href="/leagues">
        Open the app
        <Icon name="arrowRight" className="size-5" />
      </ButtonLink>
    ) : (
      <>
        <ButtonLink href="/signup">
          Create a free account
          <Icon name="arrowRight" className="size-5" />
        </ButtonLink>
        <ButtonLink href="/login" variant="secondary">
          Sign in
        </ButtonLink>
      </>
    );
  }

  if (placement === "menu") {
    return signedIn ? (
      <ButtonLink href="/leagues" className="w-full">
        Open the app
      </ButtonLink>
    ) : (
      <div className="flex flex-col gap-3">
        <ButtonLink href="/signup" className="w-full">
          Sign up
        </ButtonLink>
        <ButtonLink href="/login" variant="secondary" className="w-full">
          Sign in
        </ButtonLink>
      </div>
    );
  }

  return signedIn ? (
    <ButtonLink href="/leagues">Open the app</ButtonLink>
  ) : (
    <div className="flex items-center gap-1">
      <Link
        href="/login"
        className="inline-flex min-h-touch items-center rounded-md px-3 font-semibold text-text hover:bg-surface-muted"
      >
        Sign in
      </Link>
      <ButtonLink href="/signup">Sign up</ButtonLink>
    </div>
  );
}
