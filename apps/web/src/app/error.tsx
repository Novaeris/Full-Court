"use client";

import { useEffect } from "react";
import { Page } from "@/components/layout/primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Error boundary for every route below the root layout. */
export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <Page width="prose">
      <h1 className="sr-only">Something went wrong</h1>
      <EmptyState
        icon="info"
        title="Something went wrong"
        description={
          <>
            <p>
              The page hit an unexpected error. Trying again usually fixes it.
            </p>
            {digest ? (
              <p className="mt-2 font-mono text-sm">Reference: {digest}</p>
            ) : null}
          </>
        }
        action={
          <div className="flex flex-col gap-3 tablet:flex-row">
            <Button onClick={() => retry()}>Try again</Button>
            <ButtonLink href="/" variant="secondary">
              Go home
            </ButtonLink>
          </div>
        }
      />
    </Page>
  );
}
