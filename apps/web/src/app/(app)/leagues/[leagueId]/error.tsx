"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Error boundary for the league's pages. It sits inside the league layout, so
 * the league header and navigation stay on screen while the one page that
 * failed (a season, schedule, standings or offseason read) shows this instead.
 */
export default function LeagueErrorPage({
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
    <EmptyState
      icon="info"
      title="This part of the league couldn't load"
      description={
        <>
          <p>
            Your league is safe. Trying again usually fixes it, and the other
            tabs above still work.
          </p>
          {digest ? (
            <p className="mt-2 font-mono text-sm">Reference: {digest}</p>
          ) : null}
          <p className="mt-2">
            If it keeps happening, tell us through{" "}
            <Link
              href="/support"
              className="font-semibold text-accent underline underline-offset-4"
            >
              Contact &amp; Support
            </Link>
            {digest ? " and include the reference" : null}.
          </p>
        </>
      }
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
