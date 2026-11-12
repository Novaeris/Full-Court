import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LeagueGrid } from "@/components/leagues/league-card";
import { Page, PageHeader } from "@/components/layout/primitives";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { requireUserContext } from "@/server/auth/session";
import { listLeagues } from "@/server/services/leagues";

export const metadata: Metadata = { title: "Leagues" };

export default function LeaguesPage({ searchParams }: PageProps<"/leagues">) {
  return (
    <Page>
      <Link
        href="/owner"
        className="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-md px-2 font-semibold text-text-muted hover:text-text"
      >
        <Icon name="arrowRight" className="size-4 rotate-180" />
        Owner Mode
      </Link>
      <Suspense fallback={<ListSkeleton />}>
        <Leagues searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Leagues({
  searchParams,
}: {
  searchParams: PageProps<"/leagues">["searchParams"];
}) {
  const ctx = await requireUserContext("/leagues");
  const [{ leagues, limit }, params] = await Promise.all([
    listLeagues(ctx),
    searchParams,
  ]);
  const atLimit = leagues.length >= limit;

  return (
    <>
      <PageHeader
        title="Leagues"
        description={
          leagues.length > 0
            ? `${leagues.length} of ${limit} league slots used.`
            : "Your saved leagues live here."
        }
        actions={
          leagues.length > 0 && !atLimit ? (
            <ButtonLink href="/leagues/new">New league</ButtonLink>
          ) : null
        }
      />

      {params.notice === "league-deleted" ? (
        <p
          role="status"
          className="mb-6 rounded-md border border-win bg-surface px-4 py-3"
        >
          League deleted.
        </p>
      ) : null}

      {leagues.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No leagues yet"
          description="Create your first league to get started. You can keep up to five."
          action={<ButtonLink href="/leagues/new">Create a league</ButtonLink>}
        />
      ) : (
        <>
          <LeagueGrid leagues={leagues} />
          {atLimit ? (
            <p className="mt-6 text-text-muted">
              You&apos;ve used all {limit} league slots. Delete a league in its
              settings to make room for a new one.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
      <div className="h-10 w-48 rounded-md bg-surface-muted" />
      <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        <div className="h-28 rounded-lg bg-surface-muted" />
        <div className="h-28 rounded-lg bg-surface-muted" />
      </div>
    </div>
  );
}
