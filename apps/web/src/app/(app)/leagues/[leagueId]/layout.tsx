import Link from "next/link";
import { Suspense } from "react";
import { LeagueTabs } from "@/components/leagues/league-tabs";
import { Page } from "@/components/layout/primitives";
import { Icon } from "@/components/ui/icon";
import { loadLeague } from "@/server/leagues/load";

/** Shared frame for every page of one league: name, back link and tabs. */
export default function LeagueLayout({
  children,
  params,
}: LayoutProps<"/leagues/[leagueId]">) {
  return (
    <Page>
      <Link
        href="/leagues"
        className="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-md px-2 font-semibold text-text-muted hover:text-text"
      >
        <Icon name="arrowRight" className="size-4 rotate-180" />
        All leagues
      </Link>
      <Suspense fallback={<HeaderSkeleton />}>
        <LeagueHeader params={params} />
      </Suspense>
      <div className="mt-6">{children}</div>
    </Page>
  );
}

async function LeagueHeader({
  params,
}: {
  params: LayoutProps<"/leagues/[leagueId]">["params"];
}) {
  const { leagueId } = await params;
  const { league } = await loadLeague(leagueId);
  return (
    <header className="mt-2 flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight break-words desktop:text-4xl">
          {league.name}
        </h1>
        <p className="mt-1 text-text-muted">
          {league.status === "setup" ? "Setting up" : league.status}
        </p>
      </div>
      <LeagueTabs leagueId={league.id} />
    </header>
  );
}

function HeaderSkeleton() {
  return (
    <div aria-hidden="true" className="mt-2 flex animate-pulse flex-col gap-4">
      <div className="h-10 w-64 max-w-full rounded-md bg-surface-muted" />
      <div className="h-11 rounded-md bg-surface-muted" />
    </div>
  );
}
