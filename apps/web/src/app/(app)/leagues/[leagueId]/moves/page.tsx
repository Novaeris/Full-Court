import type { Metadata } from "next";
import { Suspense } from "react";
import { ExtensionPanel } from "@/components/season/extension-panel";
import { RosterPanel } from "@/components/season/roster-panel";
import { StrategyPanel } from "@/components/season/strategy-panel";
import { TradingBlockPanel } from "@/components/season/trading-block-panel";
import { TradePanel } from "@/components/season/trade-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getExtensions } from "@/server/services/extensions";
import { getRoster } from "@/server/services/roster";
import { getStrategy } from "@/server/services/strategy";
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
  const [trades, roster, teams, strategy, extensions] = await Promise.all([
    getTrades(ctx, league.id),
    getRoster(ctx, league.id),
    listTeams(ctx, league.id),
    getStrategy(ctx, league.id),
    getExtensions(ctx, league.id),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <TradePanel leagueId={league.id} data={trades} teams={teams} />
      <TradingBlockPanel
        // Rebuilt for another team only (a save refreshes this page, and a panel
        // keyed on what it saves would be rebuilt then, wiping its own message).
        key={trades.teamId ?? "none"}
        leagueId={league.id}
        data={trades}
      />
      <StrategyPanel
        // Rebuilt for another team only: a save refreshes this page, and a panel
        // keyed on what it saves would be rebuilt then, wiping its own message.
        key={strategy.teamId ?? "none"}
        leagueId={league.id}
        data={strategy}
      />
      <ExtensionPanel leagueId={league.id} data={extensions} />
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
