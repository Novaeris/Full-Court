import type { League } from "@fullcourt/validation";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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
      <Suspense fallback={<ListSkeleton />}>
        <Leagues searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

const STATUS_LABEL: Record<League["status"], string> = {
  setup: "Setting up",
  active: "In season",
  archived: "Archived",
};

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

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
          <ul className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link
                  href={`/leagues/${league.id}`}
                  className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 transition-colors duration-(--fc-duration-fast) hover:border-accent"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-lg font-bold break-words">
                      {league.name}
                    </span>
                    <Icon
                      name="arrowRight"
                      className="mt-1 size-5 shrink-0 text-text-muted"
                    />
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-on-accent-soft">
                      {STATUS_LABEL[league.status]}
                    </span>
                    Created {dateFormat.format(new Date(league.createdAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
