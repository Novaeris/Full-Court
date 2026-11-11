import type { Metadata } from "next";
import { Suspense } from "react";
import { Page, PageHeader } from "@/components/layout/primitives";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUserContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Leagues" };

export default function LeaguesPage() {
  return (
    <Page>
      <PageHeader
        title="Leagues"
        description="Your saved leagues will appear here."
      />
      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
        }
      >
        <Leagues />
      </Suspense>
    </Page>
  );
}

async function Leagues() {
  await requireUserContext("/leagues");
  return (
    <EmptyState
      icon="trophy"
      title="Leagues are coming soon"
      description="Your account is ready. Creating and managing leagues is the next part of Full Court to be built."
      action={
        <ButtonLink href="/about" variant="secondary">
          See the roadmap
        </ButtonLink>
      }
    />
  );
}
