import type { Metadata } from "next";
import { Suspense } from "react";
import { OffseasonReport } from "@/components/season/offseason-report";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getOffseason } from "@/server/services/offseason";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Offseason" };

export default function OffseasonPage({
  params,
}: PageProps<"/leagues/[leagueId]/offseason">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Offseason params={params} />
    </Suspense>
  );
}

async function Offseason({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/offseason">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);

  const [report, teams] = await Promise.all([
    getOffseason(ctx, league.id),
    listTeams(ctx, league.id),
  ]);

  if (report.year === null) {
    return (
      <EmptyState
        icon="trophy"
        title="No offseason yet"
        description="The offseason happens when you start a new season after the playoffs: players age and change, some retire, and the draft is held."
      />
    );
  }
  return <OffseasonReport leagueId={league.id} report={report} teams={teams} />;
}
