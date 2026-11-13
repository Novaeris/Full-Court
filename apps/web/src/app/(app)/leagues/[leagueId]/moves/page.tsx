import type { Metadata } from "next";
import { Suspense } from "react";
import { RosterPanel } from "@/components/season/roster-panel";
import { TradePanel } from "@/components/season/trade-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getRoster } from "@/server/services/roster";
import { getTrades } from "@/server/services/trades";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Moves" };

export default function MovesPage({
  params,
}: PageProps<"/leagues/[leagueId]/moves">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Moves params={params} />
    </Suspense>
  );
}

async function Moves({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/moves">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);

  if (league.status !== "active") {
    return (
      <EmptyState
        icon="trophy"
        title="Choose your team first"
        description="Trades and roster moves are for the team you run."
      />
    );
  }
  const [trades, roster, teams] = await Promise.all([
    getTrades(ctx, league.id),
    getRoster(ctx, league.id),
    listTeams(ctx, league.id),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <TradePanel leagueId={league.id} data={trades} teams={teams} />
      {roster.teamId ? (
        <RosterPanel
          leagueId={league.id}
          roster={roster}
          freeAgencyDays={false}
        />
      ) : null}
    </div>
  );
}
